import axios from 'axios';
import {logger} from './logger';
import {config} from './config';
import {
  DetailedQuestion,
  MetabaseClient,
  MetabaseAttributes,
  MetabaseQuestion,
  MetabaseContactList,
  MetabaseContact
} from './metabase';
import {SendinblueClient, SendinblueContact, SendinblueContactList} from './sendinblue';
import type {Request, Response} from 'express';
import {diff, filterObjectKeys} from './array';
import {delay, mapSeries} from 'bluebird';
import {ConnectorError, onError} from './error';
import {identity, map, omit, without} from 'lodash';

const sendinblueClient = new SendinblueClient(config.sendinblue);
const metabaseClient = new MetabaseClient(config.metabase);

type SendinblueAttribute = {type: string; fromMetabaseValue: (value: any) => any};
function fromMetabaseToSendinblueAttributesTypes(
  metabaseAttributes: MetabaseAttributes[]
): Record<string, SendinblueAttribute> {
  function toSendinblueAttributeType(metabaseType: string): SendinblueAttribute {
    // https://github.com/metabase/metabase/blob/f342fe17bd897dd4940a2c23a150a78202fa6b72/src/metabase/driver/postgres.clj#LL568C29-L581C64
    switch (metabaseType) {
      case 'type/Boolean':
        return {type: 'boolean', fromMetabaseValue: identity};

      case 'type/Date': // "2022-12-08T00:00:00Z"
      case 'type/DateTime': // "2022-12-08T09:23:46.107648Z"
      case 'type/DateTimeWithTZ': // "2022-12-08T09:23:46.107648Z"
      case 'type/DateTimeWithLocalTZ': // "2022-12-08T09:23:46.107648Z"
        return {
          type: 'date',
          fromMetabaseValue(value: string | null) {
            if (!value) return null;
            return value.split('T')[0];
          }
        };

      case 'type/Decimal':
      case 'type/Float':
      case 'type/Integer':
        return {type: 'float', fromMetabaseValue: identity};

      case 'type/Time': // "09:23:46.107648Z"
      case 'type/TimeWithTZ': // "09:23:46.107648Z"
      case 'type/Text':
      case 'type/IPAddress':
      case 'type/UUID':
      default:
        return {type: 'text', fromMetabaseValue: identity};
    }
  }
  return metabaseAttributes.reduce((acc: Record<string, SendinblueAttribute>, attribute) => {
    acc[attribute.name] = toSendinblueAttributeType(attribute.base_type);
    return acc;
  }, {});
}

function createSendinblueContactLists(metabaseQuestion: MetabaseQuestion) {
  logger.info(`creating list to sendinblue from metabase question : ${metabaseQuestion.name}`);
  const sendinblueListName = `${metabaseQuestion.id}_${metabaseQuestion.name}`;
  const sendinblueFolderId = config.sendinblue.folderId;
  return sendinblueClient
    .createContactList(sendinblueListName, sendinblueFolderId)
    .then((createdList) => createdList.id)
    .catch(onError(`cannot create sendinblue list: ${sendinblueListName} in folder: ${sendinblueFolderId}`));
}

function syncAvailableAttributes(metabaseQuestion: MetabaseQuestion): Promise<Record<string, SendinblueAttribute>> {
  return Promise.all([
    metabaseClient.fetchQuestion(metabaseQuestion.id),
    sendinblueClient.fetchContactAttributes()
  ]).then(([metabaseDetailedQuestion, sendinblueContactAttributes]) => {
    const diffContactsAttributes = diff(sendinblueContactAttributes, metabaseDetailedQuestion.result_metadata, 'name');
    const sendinblueAttributesFromMetabase = fromMetabaseToSendinblueAttributesTypes(
      metabaseDetailedQuestion.result_metadata
    );
    const sendinblueAttributesToCreate = filterObjectKeys(sendinblueAttributesFromMetabase, (key) => {
      return diffContactsAttributes.added.includes(key);
    });
    // since the sendinblue attributes are shared between list
    // we won't remove the sendinblue attributes that don't appear in the metabase question
    // because they might be used in other sendinblue contacts lists
    return mapSeries(Object.entries(omit(sendinblueAttributesToCreate, 'email')), ([attributeName, {type}]) => {
      return sendinblueClient.createContactAttribute(attributeName, type);
    }).then(() => sendinblueAttributesFromMetabase);
  });
}

function syncContacts(
  sendinblueListId: number,
  metabaseContacts: MetabaseContact[],
  sendinblueContacts: SendinblueContact[]
): Promise<{upserted: MetabaseContact[]; removed: SendinblueContact[]}> {
  const {added: contactsToRemoveOnSendinblue, removed: contactsToCreateOnSendinblue} = diff(
    metabaseContacts,
    sendinblueContacts,
    'email'
  );
  return Promise.all([
    mapSeries(contactsToCreateOnSendinblue, (contact) => {
      // create or update contact (add it to sendinblue list)
      return sendinblueClient
        .upsertContact({email: contact.email, listIds: [sendinblueListId]})
        .catch((error) => {
          logger.error(
            `encountered an error creating contact ${
              contact.email
            } on ${sendinblueListId} sendinblue list (keep going for next contacts): ${JSON.stringify(error)}`
          );
        })
        .then(() => contact);
    }),
    mapSeries(contactsToRemoveOnSendinblue, (contact) => {
      // remove the contact from the current sendinblue list
      return sendinblueClient
        .updateContacts([{email: contact.email, unlinkListIds: [sendinblueListId]}])
        .catch((error) => {
          logger.error(
            `encountered an error removing contact ${
              contact.email
            } from ${sendinblueListId} sendinblue list (keep going for next contacts): ${JSON.stringify(error)}`
          );
        })
        .then(() => contact);
    })
  ]).then(([upsertedContacts, removedContacts]) => {
    return {
      upserted: upsertedContacts.filter(Boolean),
      removed: removedContacts.filter(Boolean)
    };
  });
}

function syncContactAttributesValues(
  metabaseContacts: MetabaseContact[],
  sendinblueAttributesFromMetabase: Record<string, SendinblueAttribute>
): Promise<void> {
  function toSendinblueAttributes(metabaseContact: MetabaseContact, attributesNames: string[]) {
    return attributesNames.reduce((acc: Record<string, any>, attributeName) => {
      const metabaseAttributeValue = metabaseContact[attributeName];
      const sendinblueAttribute = sendinblueAttributesFromMetabase[attributeName];
      if (sendinblueAttribute) {
        acc[attributeName] = sendinblueAttribute.fromMetabaseValue(metabaseAttributeValue);
      }
      return acc;
    }, {});
  }
  const sendinblueContactsWithUpdatedAttributes = metabaseContacts.map((metabaseContact) => {
    const attributesNames = Object.keys(omit(metabaseContact, 'email'));
    return {
      email: metabaseContact.email,
      attributes: toSendinblueAttributes(metabaseContact, attributesNames)
    };
  });
  return sendinblueClient
    .updateContacts(sendinblueContactsWithUpdatedAttributes)
    .then(() => {})
    .catch((error) => {
      logger.error(`couldn't sync sendinblue contacts, reason: ${JSON.stringify(error)}`);
    });
}

export function syncAll() {
  logger.info('fetching questions from metabase...');
  return Promise.all([
    sendinblueClient.fetchListsOfFolder(config.sendinblue.folderId),
    metabaseClient.fetchQuestionsFromCollection(config.metabase.collectionId)
  ]).then(([sendinblueLists, metabaseQuestions]) => {
    // 1. for each metabase question...
    return mapSeries(metabaseQuestions, (metabaseQuestion) => {
      const sendinblueTargetedList = sendinblueLists.find((list) => {
        return list.name.startsWith(`${metabaseQuestion.id}_`);
      });

      return (
        sendinblueTargetedList
          ? Promise.resolve(sendinblueTargetedList.id)
          : // 2. ...create its sendinblue list equivalent (if it doesn't exist already)
            createSendinblueContactLists(metabaseQuestion)
      ).then((sendinblueListId) => {
        // 3. ...sync the attributes, they are global on sendinblue (not linked to a list)
        // here we only sync their names & types, not the values they'll have for each contact
        return syncAvailableAttributes(metabaseQuestion).then((sendinblueAttributesFromMetabase) => {
          return Promise.all([
            metabaseClient.runQuestion(metabaseQuestion.id),
            sendinblueClient.fetchContactsFromList(sendinblueListId)
          ]).then(([metabaseContacts, sendinblueContacts]) => {
            // 4. ...create contacts on metabase question but not in sendinblue list
            //  and remove contacts not on metabase question but in sendinblue list
            return syncContacts(sendinblueListId, metabaseContacts, sendinblueContacts).then(() => {
              // 5. ...update the attributes values on sendinblue contacts to match the
              // values fetched from metabase question
              return syncContactAttributesValues(metabaseContacts, sendinblueAttributesFromMetabase);
            });
          });
        });
      });
    });
  });
}

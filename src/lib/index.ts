import {mapSeries} from 'bluebird';
import {identity, map, omit, pickBy} from 'lodash';
import {config} from './config';
import {onError} from './error';
import {logger} from './logger';
import {
  MetabaseAttribute,
  MetabaseClient,
  MetabaseContact,
  MetabaseQuestion,
  MetabaseAvailableAttributeTypes
} from './metabase';
import {
  SendinblueAvailableAttributeType,
  SendinblueClient,
  SendinblueContact,
  SendinblueContactUpdatePayload
} from './sendinblue';

type ApiClients = {
  metabase: MetabaseClient;
  sendinblue: SendinblueClient;
};

type SendinblueAttribute = {
  type: SendinblueAvailableAttributeType;
  fromMetabaseValue: (value: any) => any;
};

type SyncMetabaseQuestionToSendinblueResult = {
  metabaseQuestion: MetabaseQuestion;
  sendInBlueTargetedList: {
    id: number;
    existed: boolean;
  };
  attributes: {
    created: Record<string, SendinblueAttribute>;
  };
  contacts: {
    created: MetabaseContact[];
    removed: SendinblueContact[];
    updatedWithAttributes: SendinblueContactUpdatePayload[];
  };
};

export function diff<T, U>(firstArray: T[], secondArray: U[], key?: string): {added: U[]; removed: T[]} {
  const getValue = (el: any, key?: string) => (key ? el[key] : el);
  const firstArraySet = new Set(firstArray.map((el: any) => getValue(el, key)));
  const secondArraySet = new Set(secondArray.map((el: any) => getValue(el, key)));
  return {
    added: secondArray.filter((el: any) => !firstArraySet.has(getValue(el, key))),
    removed: firstArray.filter((el: any) => !secondArraySet.has(getValue(el, key)))
  };
}

export function fromMetabaseToSendinblueAttributesTypes(
  metabaseAttributes: MetabaseAttribute[]
): Record<string, SendinblueAttribute> {
  function toSendinblueAttributeType(metabaseType: MetabaseAvailableAttributeTypes): SendinblueAttribute {
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

export function createSendinblueContactLists(
  clients: ApiClients,
  metabaseQuestion: MetabaseQuestion,
  sendinblueFolderId: number
) {
  logger.info(`creating list to sendinblue from metabase question : ${metabaseQuestion.name}`);
  const sendinblueListName = `${metabaseQuestion.id}_${metabaseQuestion.name}`;
  return clients.sendinblue
    .createContactList(sendinblueListName, sendinblueFolderId)
    .then((createdList) => createdList.id)
    .catch(onError(`cannot create sendinblue list: ${sendinblueListName} in folder: ${sendinblueFolderId}`));
}

export function syncAvailableAttributes(
  clients: ApiClients,
  metabaseQuestionId: number
): Promise<Record<string, SendinblueAttribute>> {
  return Promise.all([
    clients.metabase.fetchQuestion(metabaseQuestionId),
    clients.sendinblue.fetchContactAttributes()
  ]).then(([metabaseDetailedQuestion, sendinblueContactAttributes]) => {
    const diffContactsAttributes = diff(sendinblueContactAttributes, metabaseDetailedQuestion.result_metadata, 'name');
    const sendinblueAttributesFromMetabase = fromMetabaseToSendinblueAttributesTypes(
      metabaseDetailedQuestion.result_metadata
    );
    const diffContactsAttributesAddedNames = new Set(map(diffContactsAttributes.added, 'name'));
    const sendinblueAttributesToCreate = pickBy(sendinblueAttributesFromMetabase, (_value, key) => {
      return diffContactsAttributesAddedNames.has(key);
    });
    // since the sendinblue attributes are shared between list
    // we won't remove the sendinblue attributes that don't appear in the metabase question
    // because they might be used in other sendinblue contacts lists
    return mapSeries(Object.entries(omit(sendinblueAttributesToCreate, 'email')), ([attributeName, {type}]) => {
      return clients.sendinblue.createContactAttribute(attributeName, type);
    }).then(() => sendinblueAttributesFromMetabase);
  });
}

export function syncContacts(
  clients: ApiClients,
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
      return clients.sendinblue
        .upsertContact({email: contact.email, listIds: [sendinblueListId]})
        .catch((error) => {
          logger.error(
            `encountered an error creating contact ${contact.email} on ${sendinblueListId} sendinblue list (keep going for next contacts): ${error} ${error.stack}`
          );
        })
        .then(() => contact);
    }),
    mapSeries(contactsToRemoveOnSendinblue, (contact) => {
      // remove the contact from the current sendinblue list
      return clients.sendinblue
        .updateContacts([{email: contact.email, unlinkListIds: [sendinblueListId]}])
        .catch((error) => {
          logger.error(
            `encountered an error removing contact ${contact.email} from ${sendinblueListId} sendinblue list (keep going for next contacts): ${error}`
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
  clients: ApiClients,
  metabaseContacts: MetabaseContact[],
  sendinblueAttributesFromMetabase: Record<string, SendinblueAttribute>
): Promise<SendinblueContactUpdatePayload[]> {
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
    } as SendinblueContactUpdatePayload;
  });
  return clients.sendinblue
    .updateContacts(sendinblueContactsWithUpdatedAttributes)
    .catch((error) => {
      logger.error(`couldn't sync sendinblue contacts, reason: ${JSON.stringify(error)}`);
    })
    .then(() => sendinblueContactsWithUpdatedAttributes);
}

export function syncAll(
  metabaseCollectionId: number,
  sendinblueFolderId: number
): Promise<SyncMetabaseQuestionToSendinblueResult[]> {
  const clients = {
    sendinblue: new SendinblueClient(config.sendinblue),
    metabase: new MetabaseClient(config.metabase)
  };

  logger.info('fetching questions from metabase...');
  return Promise.all([
    clients.sendinblue.fetchListsOfFolder(sendinblueFolderId),
    clients.metabase.fetchQuestionsFromCollection(metabaseCollectionId)
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
            createSendinblueContactLists(clients, metabaseQuestion, sendinblueFolderId)
      ).then((sendinblueListId) => {
        // 3. ...sync the attributes, they are global on sendinblue (not linked to a list)
        // here we only sync their names & types, not the values they'll have for each contact
        return syncAvailableAttributes(clients, metabaseQuestion.id).then((sendinblueAttributesFromMetabase) => {
          return Promise.all([
            clients.metabase.runQuestion(metabaseQuestion.id),
            clients.sendinblue.fetchContactsFromList(sendinblueListId)
          ]).then(([metabaseContacts, sendinblueContacts]) => {
            // 4. ...create contacts present on metabase question but not in sendinblue list
            //  and remove contacts not present on metabase question but in sendinblue list
            return syncContacts(clients, sendinblueListId, metabaseContacts, sendinblueContacts).then(
              (contactsSyncStatus) => {
                // 5. ...update the attributes values on sendinblue contacts to match the
                // values fetched from metabase question
                return syncContactAttributesValues(clients, metabaseContacts, sendinblueAttributesFromMetabase).then(
                  (sendinblueContactsWithUpdatedAttributes) => {
                    return {
                      metabaseQuestion: metabaseQuestion,
                      sendInBlueTargetedList: {
                        id: sendinblueListId,
                        existed: Boolean(sendinblueTargetedList)
                      },
                      attributes: {
                        created: sendinblueAttributesFromMetabase
                      },
                      contacts: {
                        created: contactsSyncStatus.upserted,
                        removed: contactsSyncStatus.removed,
                        updatedWithAttributes: sendinblueContactsWithUpdatedAttributes
                      }
                    };
                  }
                );
              }
            );
          });
        });
      });
    });
  });
}

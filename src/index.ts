import axios from 'axios';
import {logger} from './logger';
import {config} from './config';
import {DetailedQuestion, MetabaseClient} from './metabase';
import {SendinblueClient} from './sendinblue';
import type {Request, Response} from 'express';
import {diff} from './array';
import {mapSeries} from 'bluebird';
import {ConnectorError, onError} from './error';

// export async function metabaseToSendInBlueConnector(request: Request, response: Response) {
logger.info('starting metabaseToSendInBlueConnector');

// Instantiate clients
const sendinblueClient = new SendinblueClient(config.sendinblue);
const metabaseClient = new MetabaseClient(config.metabase);

/**
 * CONTACT LISTS
 *
 * Getting contact lists from both Metabase and SendInBlue
 * Create missing lists in SendInBlue if necessary
 */

function extractContactAttributesTypes(metabaseQuestion: DetailedQuestion): Record<string, string> {
  // @TODO
}

function main() {
  // Fetching questions from metabase
  logger.info('fetching questions from metabase...');
  Promise.all([
    sendinblueClient.fetchListsOfFolder(config.sendinblue.folderId),
    metabaseClient.fetchQuestionsFromCollection(config.metabase.collectionId)
  ]).then(([sendinblueLists, metabaseQuestions]) => {
    return mapSeries(metabaseQuestions, (metabaseQuestion) => {
      const metabaseContactsList = metabaseClient.runQuestion(metabaseQuestion.id);
      const sendinblueTargetedList = sendinblueLists.find((list) => {
        return list.name.startsWith(`${metabaseQuestion.id}_`);
      });

      (() => {
        if (sendinblueTargetedList) {
          return Promise.resolve(sendinblueTargetedList.id);
        }
        // créer la liste si elle n'existe pas
        const sendinblueListName = `${metabaseQuestion.id}_${metabaseQuestion.name}`;
        const sendinblueFolderId = config.sendinblue.folderId;
        return sendinblueClient
          .createContactList(sendinblueListName, sendinblueFolderId)
          .then((createdList) => createdList.id)
          .catch(onError(`cannot create sendinblue list: ${sendinblueListName} in folder : ${sendinblueFolderId}`));
      })().then((sendinblueIdList) => {
        // comparer les contacts dans la liste sendinblue avec le metabase (ajouter/supprimer/modifier) + vérifier si mêmes attributs
        Promise.all([
          metabaseClient.fetchQuestion(metabaseQuestion.id),
          sendinblueClient.fetchContactAttributes(),
          sendinblueClient.fetchContactsFromList(sendinblueIdList)
        ]).then(([metabaseDetailedQuestion, sendinblueContactAttributes, sendinblueContactsList]) => {
          const diffContactsAttributes = diff(
            sendinblueContactAttributes.map((a) => a.name),
            metabaseDetailedQuestion.result_metadata.map((a) => a.name)
          );

          const metabaseAttributesTypes = extractContactAttributesTypes(metabaseContactsList);

          // since the sendinblue attributes are shared between list
          // we won't remove the sendinblue attributes that don't appear in the metabase question
          // because they might be used in other sendinblue contacts lists

          return mapSeries(diffContactsAttributes.added, (addedAttribute) => {
            console.log(typeof metabaseContactsList[attributeType]);
            sendinblueClient.createContactAttribute(addedAttribute);
          });

          sendinblueClient.createContactAttributes(diffContactsAttributes.added);

          const diffContactsLists = diff(metabaseContactsList, sendinblueContactsList, 'email');
        });
      });
    });
  });
}

main();
// // Fetching contact lists from metabase
// logger.info('fetching contacts from metabase...');

// // Fetching contact lists from sendinblue
// logger.info('fetching contact lists from sendinblue...');
// const sendinblueContactLists = await sendinblueClient.fetchLists();

// // Compute contact lists presents in Metabase but missing in Sendinblue
// const missingListsInSendInBlue = ArrayUtils.elementsNotInArray(metabaseContactLists, sendinblueContactLists, 'name');

// // Create missing contact lists in SendInBlue
// if (missingListsInSendInBlue.length > 0) {
//     logger.info(`creating ${missingListsInSendInBlue.length} (missing) list(s) in sendinblue`, {lists: missingListsInSendInBlue});
//     await sendinblueClient.createContactLists(missingListsInSendInBlue.map((list) => list.name));
// }

// logger.info(`${metabaseContactLists.length} list(s) to synchronize`);

// // Compute contact lists presents in SendInBlue but missing in Metabase, log purpose only
// const missingListsInMetabase = ArrayUtils.elementsNotInArray(sendinblueContactLists, metabaseContactLists, 'name');
// missingListsInMetabase.length > 0 && logger.warn(`following list are missing in Metabase: ${missingListsInMetabase.map((list) => list.name).join(', ')}`);

// /**
//  * CONTACT ATTRIBUTES
//  *
//  * Getting contact attributes from both Metabase and SendInBlue
//  * Create missing lists in SendInBlue if necessary
//  */

// // Concat every Metabase list attributes
// // Take the first contact of every list and get its attributes
// logger.info('concatenating contact attributes from metabase...');
// const metabaseContactAttributes = metabaseContactLists.flatMap(({contacts}) => Object.keys(contacts[0] ?? {}));
// const distinctMetabaseContactAttributes = uniq(metabaseContactAttributes).map((attribute) => attribute.toUpperCase());

// // Fetch sendinblue contact attributes
// logger.info('fetching contact attributes from sendinblue...');
// const sendinblueContactAttributes = ['EMAIL', ...(await sendinblueClient.fetchContactAttributes())];

// // Identify attributes to create
// const missingAttributesInSendinblue = ArrayUtils.elementsNotInArray(metabaseContactAttributes, sendinblueContactAttributes);

// // Create missing contact attributes in SendInBlue
// if (missingAttributesInSendinblue.length > 0) {
//     logger.info(`creating ${missingAttributesInSendinblue.length} (missing) attribute(s) in sendinblue`, {attributes: missingAttributesInSendinblue});
//     await sendinblueClient.createContactAttributes(missingAttributesInSendinblue);
// }

// /**
//  * SYNCHRONIZE CONTACTS
//  */

// // TODO: (Optional) Specific to cometmedias: some emails need to be cleaned before import
// // TODO: (Optional) Identify which contacts to add / delete (we could just bulk delete and bulk create)
// // TODO: (Required) Update lists

// if (config.betteruptime.heartbeatUrl) {
//     logger.info('sending heartbeat to BetterUpTime');
//     await axios.get(config.betteruptime.heartbeatUrl);
// }

// return response.send(201);
// }

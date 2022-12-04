import axios from 'axios';
import {Promise} from 'bluebird';
import {logger} from './logger';
import {config} from './config';
import {MetabaseClient, MetabaseContactList, Question} from './metabase';
import {SendinblueClient} from './sendinblue';
import type {Request, Response} from 'express';

export async function metabaseToSendInBlueConnector(request: Request, response: Response) {
    logger.info('starting metabaseToSendInBlueConnector');

    // Fetching contact lists from metabase
    logger.info('fetching questions from metabase...');
    const metabaseClient = new MetabaseClient(config.metabase);
    const questions = await metabaseClient.fetchQuestions();

    logger.info('fetching contacts from metabase...');
    const metabaseContactLists = await metabaseClient.fetchContactLists(questions);

    // Fetching contact lists from sendinblue
    logger.info('fetching contact lists from sendinblue...');
    const sendinblueClient = new SendinblueClient(config.sendinblue);
    const sendinblueContactLists = await sendinblueClient.fetchLists();

    // Identify lists to synchronize
    // TODO: Would be nice to refactor, this is just a draft
    const missingListsInMetabase = metabaseContactLists.filter((mlist) => !sendinblueContactLists.find((slist) => mlist.name === slist.name));
    missingListsInMetabase.length > 0 && logger.warn(`following list are missing in Metabase: ${missingListsInMetabase.map((list) => list.name).join(', ')}`);

    const missingListsInSendInBlue = sendinblueContactLists.filter((slist) => !metabaseContactLists.find((mlist) => mlist.name === slist.name));
    missingListsInSendInBlue.length > 0 && logger.warn(`following list are missing in SendInBlue: ${missingListsInSendInBlue.map((list) => list.name).join(', ')}`);

    const listsToSynchronize = metabaseContactLists.reduce((lists: any[], mlist) => {
        const sendinblueListId = sendinblueContactLists.find((slist) => slist.name === mlist.name.replace('metabase', 'sendinblue'));
        return sendinblueListId ? [...lists, {...mlist, sendinblueListId}] : lists;
    }, []);
    listsToSynchronize.length > 0 ? logger.info(`synchronizing ${listsToSynchronize.length} lists`) : logger.info('no list to synchronize');

    // TODO: (Required) Fetch sendinblue contact lists' attributes
    //       If missing, must update contact attributes list: https://developers.sendinblue.com/reference/createattribute-1
    // TODO: (Required) Uppercase attributes
    // TODO: (Optional) Specific to cometmedias: some emails need to be cleaned before import
    // TODO: (Optional) Identify which contacts to add / delete (we could just bulk delete and bulk create)
    // TODO: (Required) Update lists

    if (config.betteruptime.heartbeatUrl) {
        logger.info('sending heartbeat to BetterUpTime');
        await axios.get(config.betteruptime.heartbeatUrl);
    }

    return response.send(201);
}

import axios from 'axios';
import {logger} from './logger';
import {config} from './config';
import {MetabaseClient} from './metabase';
import {SendinblueClient} from './sendinblue';
import type {Request, Response} from 'express';
import {ArrayUtils} from './array';

export async function metabaseToSendInBlueConnector(request: Request, response: Response) {
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

    // Fetching questions from metabase
    logger.info('fetching questions from metabase...');
    const questions = await metabaseClient.fetchQuestions();

    // Stop the process if no list to synchronize
    if (questions.length === 0) {
        logger.info('no list to synchronize');
        return;
    }

    // Fetching contact lists from metabase
    logger.info('fetching contacts from metabase...');
    const metabaseContactLists = await metabaseClient.fetchContactLists(questions);

    // Fetching contact lists from sendinblue
    logger.info('fetching contact lists from sendinblue...');
    const sendinblueContactLists = await sendinblueClient.fetchLists();

    // Compute contact lists presents in Metabase but missing in Sendinblue
    const missingListsInSendInBlue = ArrayUtils.elementsNotInArray(metabaseContactLists, sendinblueContactLists, 'name');

    // Create missing contact lists in SendInBlue
    if (missingListsInSendInBlue.length > 0) {
        logger.info(`creating ${missingListsInSendInBlue.length} (missing) list(s) in sendinblue`, {lists: missingListsInSendInBlue});
        await sendinblueClient.createContactLists(missingListsInSendInBlue.map((list) => list.name));
    }

    logger.info(`${metabaseContactLists.length} list(s) to synchronize`);

    // Compute contact lists presents in SendInBlue but missing in Metabase, log purpose only
    const missingListsInMetabase = ArrayUtils.elementsNotInArray(sendinblueContactLists, metabaseContactLists, 'name');
    missingListsInMetabase.length > 0 && logger.warn(`following list are missing in Metabase: ${missingListsInMetabase.map((list) => list.name).join(', ')}`);

    /**
     * CONTACT ATTRIBUTES
     *
     * Getting contact attributes from both Metabase and SendInBlue
     * Create missing lists in SendInBlue if necessary
     */

    // Concat every Metabase list attributes
    // Take the first contact of every list and get its attributes
    logger.info('concatenating contact attributes from metabase...');
    const metabaseContactAttributes = metabaseContactLists.flatMap(({contacts}) => Object.keys(contacts[0] ?? {}));
    const distinctMetabaseContactAttributes = ArrayUtils.distinctArray(metabaseContactAttributes).map((attribute) => attribute.toUpperCase());

    // Fetch sendinblue contact attributes
    logger.info('fetching contact attributes from sendinblue...');
    const sendinblueContactAttributes = ['EMAIL', ...(await sendinblueClient.fetchContactAttributes())];

    // Identify attributes to create
    const missingAttributesInSendinblue = ArrayUtils.elementsNotInArray(metabaseContactAttributes, sendinblueContactAttributes);

    // Create missing contact attributes in SendInBlue
    if (missingAttributesInSendinblue.length > 0) {
        logger.info(`creating ${missingAttributesInSendinblue.length} (missing) attribute(s) in sendinblue`, {attributes: missingAttributesInSendinblue});
        await sendinblueClient.createContactAttributes(missingAttributesInSendinblue);
    }

    /**
     * SYNCHRONIZE CONTACTS
     */

    // TODO: (Optional) Specific to cometmedias: some emails need to be cleaned before import
    // TODO: (Optional) Identify which contacts to add / delete (we could just bulk delete and bulk create)
    // TODO: (Required) Update lists

    if (config.betteruptime.heartbeatUrl) {
        logger.info('sending heartbeat to BetterUpTime');
        await axios.get(config.betteruptime.heartbeatUrl);
    }

    return response.send(201);
}

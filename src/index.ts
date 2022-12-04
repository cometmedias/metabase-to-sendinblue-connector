import axios from 'axios';
import {Promise} from 'bluebird';
import {logger} from './logger';
import {config} from './config';
import {ContactList, MetabaseClient} from './metabase';
import type {Request, Response} from 'express';

export async function metabaseToSendInBlueConnector(request: Request, response: Response) {
    logger.info('starting metabaseToSendInBlueConnector');

    logger.info('fetching questions...');
    const metabaseClient = new MetabaseClient(config.metabase);
    const questions = await metabaseClient.fetchQuestions();

    logger.info('fetching contacts...');
    const contactLists: ContactList[] = await Promise.map(questions, async (question) => ({
        question: question,
        contacts: await metabaseClient.fetchContacts(question.id)
    }));

    if (config.betteruptime.heartbeatUrl) {
        logger.info('sending heartbeat to BetterUpTime');
        await axios.get(config.betteruptime.heartbeatUrl);
    }

    return response.send(201);
}

// @ts-ignore
(async () => await metabaseToSendInBlueConnector(null, {send: console.log}))();

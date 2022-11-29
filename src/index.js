import axios from 'axios';
import {MetabaseService} from './services/index.js';
import {mapAsync} from './utils/index.js';

const {BETTER_UPTIME_HEARTBEAT_URL} = process.env;

export async function metabaseToSendInBlueConnector(request, response) {
    console.info('Starting metabaseToSendInBlueConnector');

    console.info('Fetching contact lists...');
    const contactLists = await MetabaseService.fetchContactLists();

    console.info('Fetching contacts...');
    const contactListsWithContacts = await mapAsync(contactLists, async (contactList) => ({
        ...contactList,
        contacts: await MetabaseService.fetchContacts(contactList)
    }));

    console.info('Done');
    console.log(contactListsWithContacts);

    if (BETTER_UPTIME_HEARTBEAT_URL) {
        console.info('Sending heartbeat to BetterUpTime');
        await axios.get(BETTER_UPTIME_HEARTBEAT_URL);
    }

    return response.send(201);
}

import axios from 'axios';

const {BETTER_UPTIME_HEARTBEAT_URL} = process.env;

export async function metabaseToSendInBlueConnector(request, response) {
    console.info('Starting metabaseToSendInBlueConnector');

    if (BETTER_UPTIME_HEARTBEAT_URL) {
        console.info('Sending heartbeat to BetterUpTime');
        await axios.get(BETTER_UPTIME_HEARTBEAT_URL);
    }

    return response.send(201);
}

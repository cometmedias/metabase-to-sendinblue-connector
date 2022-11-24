import {logger} from './logger';
import {MetabaseConfig} from './metabase';
import {SendinblueConfig} from './sendinblue';

const commonEnv = require('common-env/withLogger')(logger);

interface BetteruptimeConfig {
    hearthbeatUrl: string;
}

interface Config {
    metabase: MetabaseConfig;
    sendinblue: SendinblueConfig;
    betteruptime: BetteruptimeConfig;
}

const secureString = {
    $type: commonEnv.types.String,
    $secure: true,
    $default: ''
};

const defaultConfig: Config = {
    metabase: {
        host: '',
        username: '',
        password: secureString
    },
    sendinblue: {
        baseUrl: 'https://api.sendinblue.com/v3',
        apiKey: secureString,
        listId: 0
    },
    betteruptime: {
        hearthbeatUrl: ''
    }
};

export const config: Config = commonEnv.getOrElseAll(defaultConfig);

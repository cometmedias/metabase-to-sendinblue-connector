import {logger} from './logger';
import {MetabaseConfig} from './metabase';
import {SendinblueConfig} from './sendinblue';

const commonEnv = require('common-env/withLogger')(logger);

interface BetteruptimeConfig {
  heartbeatUrl: string;
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
    password: secureString,
    collectionId: 0
  },
  sendinblue: {
    baseUrl: 'https://api.sendinblue.com/v3',
    apiKey: secureString,
    folderId: 1,
    attributeCategory: 'normal'
  },
  betteruptime: {
    heartbeatUrl: ''
  }
};

export const config: Config = commonEnv.getOrElseAll(defaultConfig);

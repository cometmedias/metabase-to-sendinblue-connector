import {metabaseToSendInBlueConnector} from './index';

// @ts-ignore pour tester en local
(async () => await metabaseToSendInBlueConnector(null, {send: console.log}))();

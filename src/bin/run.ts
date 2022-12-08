import {delay} from 'bluebird';
import {syncAll} from '..';
import {logger} from '../logger';

syncAll()
  .then(() => {
    logger.info(`✅ done syncing contacts list!`);
    // wait for the logs to flush and exit the process
    return delay(10 * 1000).then(() => process.exit(0));
  })
  .catch((error) => {
    logger.error(error);
    process.exit(0);
  });

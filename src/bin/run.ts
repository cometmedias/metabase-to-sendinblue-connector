import {delay} from 'bluebird';
import dedent from 'dedent';
import {syncAll} from '../lib';
import {config} from '../lib/config';
import {logger} from '../lib/logger';

import {promisify} from 'util';
import {writeFile} from 'fs';
const writeFileP = promisify(writeFile);

syncAll(config.metabase.collectionId, config.sendinblue.folderId)
  .then((output) => {
    return writeFileP('./output/sync-output.json', JSON.stringify(output, null, 2)).then(() => output);
  })
  .then((output) => {
    const {
      metabase: {collectionId: colId},
      sendinblue: {folderId: foldId}
    } = config;
    logger.info(dedent`
      ✅ done syncing ${output.length} metabase questions from collection ${colId} to sendinblue folder ${foldId}!

      ${output
        .map(({metabaseQuestion, sendInBlueTargetedList: sibtl, attributes, contacts}) => {
          return dedent`
          👉 [${metabaseQuestion.id}] ${metabaseQuestion.name} -> ${sibtl.id} (existed: ${sibtl.existed})
                - attibutes created: ${Object.keys(attributes).join(', ')}
                - contacts:
                    - created: ${contacts.created.length}
                    - removed: ${contacts.removed.length}
                    - updatedWithAttributes: ${contacts.updatedWithAttributes.length}

        `;
        })
        .join('\n')}
    `);

    // wait for the logs to flush and exit the process
    return delay(10 * 1000).then(() => process.exit(0));
  })
  .catch((error) => {
    logger.error(error);
    process.exit(0);
  });

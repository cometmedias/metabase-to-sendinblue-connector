import {syncAll} from '../index';
import {Request, Response} from 'express';

export async function metabaseToSendInBlueConnector(_request: Request, response: Response) {
  return syncAll()
    .then(() => response.send(200))
    .catch((error) => {
      response.status(500).send(error);
    });
}

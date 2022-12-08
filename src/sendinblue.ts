import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {delay, Promise} from 'bluebird';
import {chunk} from 'lodash';
import {onAxiosError, onError} from './error';
import {logger} from './logger';
import {MetabaseContact} from './metabase';

export type SendinblueContactList = {
  id: number;
  name: string;
  folderId: 1;
  uniqueSubscribers: number;
  totalBlacklisted: number;
  totalSubscribers: number;
};

export type SendinblueContact = {
  email: string;
  id: number;
  emailBlacklisted: boolean;
  smsBlacklisted: boolean;
  createdAt: string;
  modifiedAt: string;
  listIds: number[];
  attributes: Record<string, any>;
};

type SendinblueContactCreatePayload = Partial<Omit<SendinblueContact, 'id' | 'createdAt' | 'modifiedAt'>>;

type SendinblueContactUpdatePayload = Partial<SendinblueContactCreatePayload> & {
  unlinkListIds?: number[];
};

type ContactAttributes = {
  name: string;
  category: string;
  type: string;
  calculatedValue: string;
};

export type SendinblueConfig = {
  baseUrl: string;
  apiKey: any;
  folderId: number;
  attributeCategory: string;
};

export class SendinblueClient {
  constructor(private config: SendinblueConfig) {}

  private makeRequest(axiosConfig: AxiosRequestConfig, retries = 0): Promise<AxiosResponse> {
    logger.info(
      `${retries > 0 ? `(retry ${retries}) ` : ''}making request on sendinblue: ${JSON.stringify(axiosConfig)}`
    );
    return axios({
      ...axiosConfig,
      headers: {
        ...axiosConfig.headers,
        'api-key': this.config.apiKey
      }
    })
      .catch(onAxiosError('cannot make request on sendinblue'))
      .catch((error) => {
        if (error.status === 400) {
          throw error;
        }
        logger.error(`error making request to sendinblue: ${error}`);
        if (retries > 5) {
          throw error;
        }
        return delay(retries * 1000).then(() => this.makeRequest(axiosConfig, retries + 1));
      });
  }

  // https://developers.sendinblue.com/reference/getlists-1
  public fetchListsOfFolder(folderId: number): Promise<SendinblueContactList[]> {
    logger.info(`fetching sendinblue lists of folder ${folderId}`);
    return this.makeRequest({
      method: 'GET',
      url: `${this.config.baseUrl}/contacts/folders/${folderId}/lists`
    })
      .then((response) => response.data.lists || [])
      .catch(onError('cannot fetch contact lists on sendinblue'));
  }

  // https://developers.sendinblue.com/reference/createlist-1
  public createContactList(listName: string, folderId: number): Promise<{id: number}> {
    logger.info(`create sendinblue contact list ${listName} of folder ${folderId}`);
    return this.makeRequest({
      method: 'POST',
      url: `${this.config.baseUrl}/contacts/lists`,
      data: {
        name: listName,
        folderId: folderId
      }
    })
      .then((response) => response.data)
      .catch(onError(`cannot create contact lists on sendinblue`));
  }

  // https://developers.sendinblue.com/reference/getcontactsfromlist
  public fetchContactsFromList(listId: number): Promise<SendinblueContact[]> {
    const fetchChunk = (
      acc: SendinblueContact[] = [],
      offset: number = 0,
      limit: number = 500
    ): Promise<SendinblueContact[]> => {
      logger.info(`fetching sendinblue contacts from list ${listId}, offset ${offset} limit ${limit}`);
      return this.makeRequest({
        method: 'GET',
        url: `${this.config.baseUrl}/contacts/lists/${listId}/contacts`,
        params: {
          limit,
          offset
        }
      })
        .then((response) => {
          const contacts = response.data.contacts as SendinblueContact[];
          const newAcc = acc.concat(contacts);
          if (contacts.length < limit) {
            return newAcc;
          }
          return fetchChunk(newAcc, offset + limit, limit);
        })
        .catch(onError(`cannot fetch contacts from list: ${listId}`));
    };
    return fetchChunk();
  }

  // https://developers.sendinblue.com/reference/getattributes-1
  public fetchContactAttributes(): Promise<ContactAttributes[]> {
    logger.info(`fetching sendinblue contacts attributes`);
    return this.makeRequest({
      method: 'GET',
      url: `${this.config.baseUrl}/contacts/attributes`
    })
      .then((response) => response.data.attributes as ContactAttributes[])
      .catch(onError('cannot fetch contact attributes on sendinblue'));
  }

  // https://developers.sendinblue.com/reference/createattribute-1
  public createContactAttribute(attributeName: string, attributeType: string, category = 'normal'): Promise<void> {
    logger.info(`create sendinblue contacts attribute ${attributeName} of type ${attributeType}`);
    return this.makeRequest({
      method: 'POST',
      url: `${this.config.baseUrl}/contacts/attributes/${category}/${attributeName}`,
      data: {
        type: attributeType
      }
    })
      .then(() => {})
      .catch(onError(`cannot create contact attribute on sendinblue, attributeName: ${attributeName}`));
  }

  // https://developers.sendinblue.com/reference/createcontact
  public upsertContact(payload: SendinblueContactCreatePayload) {
    logger.info(`create sendinblue contact ${payload.email} belonging to list ${payload.listIds}`);
    return this.makeRequest({
      method: 'POST',
      url: `${this.config.baseUrl}/contacts`,
      data: payload
    })
      .then(() => {})
      .catch((error) => {
        if (error.response.data.code === 'duplicate_parameter') {
          return this.updateContacts([payload]);
        }
        return onError(`couldn't create sendinblue contact ${payload.email}`, error.response.status)(error);
      });
  }

  // https://developers.sendinblue.com/reference/updatebatchcontacts
  public async updateContacts(contacts: SendinblueContactUpdatePayload[]) {
    const contactsChunks = chunk(contacts, 500);
    const totalChunks = contactsChunks.length;
    return Promise.mapSeries(contactsChunks, (contactsChunk, i) => {
      logger.info(`updating sendinblue contacts, chunk ${i + 1}/${totalChunks}`);
      return this.makeRequest({
        method: 'POST',
        url: `${this.config.baseUrl}/contacts/batch`,
        data: {
          contacts: contactsChunk
        }
      }).catch(onError(`cannot update contacts chunk ${i + 1}/${totalChunks} on sendinblue`));
    });
  }
}

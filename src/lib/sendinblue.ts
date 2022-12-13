import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {delay, Promise, map} from 'bluebird';
import {chunk} from 'lodash';
import {onAxiosError, onError} from './error';
import {logger} from './logger';

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

export type SendinblueContactUpdatePayload = SendinblueContactCreatePayload & {
  unlinkListIds?: number[];
};

export type SendinblueAvailableAttributeType = 'boolean' | 'date' | 'float' | 'text';

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
  testFolderId: number;
  attributeCategory: string;
  requestsConcurrency: number;
};

export class SendinblueClient {
  constructor(private config: SendinblueConfig) {}

  private makeRequest(
    axiosConfig: AxiosRequestConfig,
    retries = 0,
    options = {logError: true}
  ): Promise<AxiosResponse> {
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
        if (options.logError) {
          logger.error(`error making request to sendinblue: ${error}`);
        }
        // no need to retry when we have these errors
        if (error.status >= 400 && error.status <= 404) {
          throw error;
        }
        if (retries > 5) {
          throw error;
        }
        return delay(retries * 1000).then(() => this.makeRequest(axiosConfig, retries + 1));
      });
  }

  // https://developers.sendinblue.com/reference/getlists-1
  fetchListsOfFolder(folderId: number): Promise<SendinblueContactList[]> {
    logger.info(`fetching sendinblue lists of folder ${folderId}`);
    return this.makeRequest({
      method: 'GET',
      url: `${this.config.baseUrl}/contacts/folders/${folderId}/lists`
    })
      .then((response) => response.data.lists || [])
      .catch(onError('cannot fetch contact lists on sendinblue'));
  }

  // https://developers.sendinblue.com/reference/createlist-1
  createContactList(listName: string, folderId: number): Promise<{id: number}> {
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

  // https://developers.sendinblue.com/reference/deletelist-1
  removeContactList(listId: number): Promise<void> {
    logger.info(`removing sendinblue contact list ${listId}`);
    return (
      this.makeRequest({
        method: 'DELETE',
        url: `${this.config.baseUrl}/contacts/lists/${listId}`
      })
        // res.data is empty, nothing returned from sendinblue
        .then(() => {})
        .catch(onError(`cannot remove contact list ${listId} on sendinblue`))
    );
  }

  removeAllContactListsOfFolder(folderId: number): Promise<void> {
    logger.info(`removing all sendinblue contact list of folder ${folderId}`);
    return this.fetchListsOfFolder(folderId)
      .then((lists) => {
        return map(
          lists,
          (list) => {
            this.removeContactList(list.id);
          },
          {concurrency: this.config.requestsConcurrency}
        );
      })
      .then(() => {})
      .catch(onError(`cannot remove all contact lists from folder ${folderId} on sendinblue`));
  }

  // https://developers.sendinblue.com/reference/getcontactsfromlist
  fetchContactsFromList(listId: number): Promise<SendinblueContact[]> {
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
  fetchContactAttributes(): Promise<ContactAttributes[]> {
    logger.info(`fetching sendinblue contacts attributes`);
    return this.makeRequest({
      method: 'GET',
      url: `${this.config.baseUrl}/contacts/attributes`
    })
      .then((response) => response.data.attributes as ContactAttributes[])
      .catch(onError('cannot fetch contact attributes on sendinblue'));
  }

  // https://developers.sendinblue.com/reference/createattribute-1
  createContactAttribute(
    attributeName: string,
    attributeType: SendinblueAvailableAttributeType,
    attributeCategory = 'normal'
  ): Promise<void> {
    logger.info(`create sendinblue contacts attribute ${attributeName} of type ${attributeType}`);
    return (
      this.makeRequest({
        method: 'POST',
        url: `${this.config.baseUrl}/contacts/attributes/${attributeCategory}/${attributeName}`,
        data: {
          type: attributeType
        }
      })
        // res.data is empty, nothing returned from sendinblue
        .then(() => {})
        .catch(onError(`cannot create contact attribute on sendinblue, attributeName: ${attributeName}`))
    );
  }

  removeContactAttribute(attributeName: string, attributeCategory = 'normal'): Promise<void> {
    logger.info(`removing sendinblue contacts attribute ${attributeName}`);
    return (
      this.makeRequest({
        method: 'DELETE',
        url: `${this.config.baseUrl}/contacts/attributes/${attributeCategory}/${attributeName}`
      })
        // res.data is empty, nothing returned from sendinblue
        .then(() => {})
        .catch(onError(`cannot remove contact attribute ${attributeName} on sendinblue`))
    );
  }

  // https://developers.sendinblue.com/reference/createcontact
  upsertContact(payload: SendinblueContactCreatePayload): Promise<{id: number}> {
    logger.info(`create sendinblue contact ${payload.email} belonging to list ${payload.listIds}`);
    return this.makeRequest(
      {
        method: 'POST',
        url: `${this.config.baseUrl}/contacts`,
        data: payload
      },
      0,
      {logError: false}
    )
      .then((response) => response.data)
      .catch((error) => {
        const errorMessage = `couldn't create sendinblue contact ${payload.email}`;
        // if the contact already exists, update it
        if (error.message && error.message.includes('duplicate_parameter')) {
          return this.updateContacts([payload]);
        }
        return onError(errorMessage, error.response.status)(error);
      });
  }

  // https://developers.sendinblue.com/reference/updatebatchcontacts
  updateContacts(contacts: SendinblueContactUpdatePayload[]): Promise<void> {
    const contactsChunks = chunk(contacts, 500);
    const totalChunks = contactsChunks.length;
    return Promise.map(
      contactsChunks,
      (contactsChunk, i) => {
        logger.info(`updating sendinblue contacts, chunk ${i + 1}/${totalChunks}`);
        return this.makeRequest({
          method: 'POST',
          url: `${this.config.baseUrl}/contacts/batch`,
          data: {
            contacts: contactsChunk
          }
          // res.data is empty, nothing returned from sendinblue
        }).catch(onError(`cannot update contacts chunk ${i + 1}/${totalChunks} on sendinblue`));
      },
      {concurrency: this.config.requestsConcurrency}
    ).then(() => {});
  }
}

import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {Promise} from 'bluebird';
import {onAxiosError, onError} from './error';
import {logger} from './logger';
import {Contact} from './metabase';

export interface SendinblueContactList {
    id: string;
    name: string;
}

function formatEmail(email: string): string {
    // "fanny_michaud2000@yahoo.fr / fanny.michaud@nantesmetropole.fr"
    // "eduval@@kalelia.fr"
    // "caroline.pelletier31@gmail.com "
    return email.split('/')[0]!.replace('@@', '@').replace(' ', '');
}

// function formatAttributes(contact) {
//     return {
//         ...Object.fromEntries(attributes.map((attribute) => [attribute, contact[attribute]])),
//         email: formatEmail(contact.EMAIL)
//     };
// }

// function formatContacts(listId) {
//     return (contacts) =>
//         contacts.map((contact) => ({
//             email: formatEmail(contact.EMAIL),
//             attributes: formatAttributes(contact),
//             listIds: [listId],
//             updateEnabled: true
//         }));
// }

export interface SendinblueConfig {
    baseUrl: string;
    apiKey: any;
    folderId: number;
    attributeCategory: string;
}

export class SendinblueClient {
    constructor(private config: SendinblueConfig) {}

    private async makeRequest(axiosConfig: AxiosRequestConfig): Promise<AxiosResponse> {
        logger.info(`making request on sendinblue: ${JSON.stringify(axiosConfig)}`);
        return axios({
            ...axiosConfig,
            headers: {
                ...axiosConfig.headers,
                'api-key': this.config.apiKey
            }
        }).catch(onAxiosError('cannot make request on sendinblue'));
    }

    // https://developers.sendinblue.com/reference/getlists-1
    public async fetchLists(): Promise<SendinblueContactList[]> {
        return this.makeRequest({
            method: 'GET',
            url: `${this.config.baseUrl}/contacts/lists`
        })
            .then((response) => response.data.lists)
            .then((lists) => lists.map((list: any) => ({...list, name: list.name.toLowerCase()})))
            .then((lists) => lists.filter((list: any) => list.name.startsWith('metabase')))
            .catch(onError('cannot fetch contact lists on sendinblue'));
    }

    // https://developers.sendinblue.com/reference/createlist-1
    public async createContactLists(listNames: string[]): Promise<void> {
        await Promise.map(listNames, async (listName: string) => {
            await this.makeRequest({
                method: 'POST',
                url: `${this.config.baseUrl}/contacts/lists`,
                data: {
                    name: listName,
                    folderId: this.config.folderId
                }
            });
        }).catch(onError(`cannot create contact lists on sendinblue`));
    }

    // https://developers.sendinblue.com/reference/getattributes-1
    public async fetchContactAttributes(): Promise<string[]> {
        return this.makeRequest({
            method: 'GET',
            url: `${this.config.baseUrl}/contacts/attributes`
        })
            .then((response) => response.data.attributes)
            .then((attributes) => attributes.map((attribute: any) => attribute.name))
            .catch(onError('cannot fetch contact attributes on sendinblue'));
    }

    // https://developers.sendinblue.com/reference/createattribute-1
    public async createContactAttributes(attributeNames: string[]): Promise<void> {
        await Promise.map(attributeNames, async (attributeName: string) => {
            await this.makeRequest({
                method: 'POST',
                url: `${this.config.baseUrl}/contacts/lists`,
                data: {
                    attributeCategory: this.config.attributeCategory,
                    attributeName
                }
            });
        }).catch(onError(`cannot create contact attributes on sendinblue`));
    }

    // https://developers.sendinblue.com/reference/updatebatchcontacts
    public async updateContacts(contacts: Contact[]) {
        // return this.makeRequest({
        //     method: 'POST',
        //     url: `${this.config.baseUrl}/contacts/batch`,
        //     data: {
        //         contacts: contacts.map((contact) => {
        //             return {
        //                 ...contact,
        //                 listIds: [this.config.listId]
        //             };
        //         })
        //     }
        // }).catch(onError(`cannot update contacts on list ${this.config.listId} on sendinblue`));
    }

    // public async deleteContacts(contacts: any[]) {
    //     try {
    //         logger.info(`Deleting ${contacts.length} contacts`);
    //         await forEachAsync(contacts, async (contact) => {
    //             try {
    //                 await axios.delete(`https://api.sendinblue.com/v3/contacts/${contact.email}`, headers);
    //             } catch (error) {
    //                 // Ignore users not found
    //                 if (error.response.status !== 404) throw error;
    //             }
    //         });
    //         logger.info(`${contacts.length} contacts deleted successfully`);
    //     } catch (error) {
    //         console.error(error);
    //         throw new Error('An error occurred while deleting contacts in sendinblue', error);
    //     }
    // }
}

// new Sendinblue(config.sendinblue)
//     .updateContacts([
//         {
//             email: 'baumier.romain@gmail.com',
//             attributes: {}
//         }
//     ])
//     .then((res) => {
//         console.log('res', res);
//     });

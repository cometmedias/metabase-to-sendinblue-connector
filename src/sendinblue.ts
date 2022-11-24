import axios, {AxiosRequestConfig} from 'axios';
import {onAxiosError, onError} from './error';
import {logger} from './logger';

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
    listId: number;
}

export class Sendinblue {
    constructor(private config: SendinblueConfig) {}

    private makeRequest(axiosConfig: AxiosRequestConfig) {
        logger.info(`making request on sendinblue: ${JSON.stringify(axiosConfig)}`);
        return axios({
            ...axiosConfig,
            headers: {
                ...axiosConfig.headers,
                'api-key': this.config.apiKey
            }
        }).catch(onAxiosError('cannot make request on sendinblue'));
    }

    // https://developers.sendinblue.com/reference/updatebatchcontacts
    updateContacts(contacts: any[]) {
        return this.makeRequest({
            method: 'POST',
            url: `${this.config.baseUrl}/contacts/batch`,
            data: {
                contacts: contacts.map((contact) => {
                    return {
                        ...contact,
                        listIds: [this.config.listId]
                    };
                })
            }
        }).catch(onError(`cannot update contacts on list ${this.config.listId} on sendinblue`));
    }

    // deleteContacts(contacts: any[]) {
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

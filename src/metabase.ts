import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {onAxiosError, onError} from './error';
import {logger} from './logger';

export interface MetabaseConfig {
    host: string;
    username: string;
    password: any;
}

export interface Question {
    name: string;
    id: number;
}

export interface Contact {
    email: string;
    [additionalProperties: string]: string | number | boolean;
}

export interface ContactList {
    question: Question;
    contacts: Contact[];
}

export class MetabaseClient {
    private token: string | null = null;

    constructor(private config: MetabaseConfig) {}

    private makeRequest(axiosConfig: AxiosRequestConfig): Promise<AxiosResponse> {
        logger.info(`making request on metabase: ${JSON.stringify(axiosConfig)}`);
        return (this.token ? Promise.resolve() : this.authenticate())
            .then(() => {
                return axios({
                    ...axiosConfig,
                    headers: {
                        ...axiosConfig.headers,
                        'X-Metabase-Session': this.token
                    }
                });
            })
            .catch(onAxiosError('cannot make request on metabase'));
    }

    // https://www.metabase.com/docs/latest/api/session.html#post-apisession
    private authenticate(): Promise<void> {
        console.log(this.config.host);
        return axios({
            method: 'POST',
            url: `${this.config.host}/api/session`,
            data: {
                username: this.config.username,
                password: this.config.password
            }
        }).then((res) => {
            this.token = res.data.id;
        });
    }

    // https://www.metabase.com/docs/latest/api/card#get-apicard
    fetchQuestions(): Promise<Question[]> {
        return this.makeRequest({
            method: 'GET',
            url: `${this.config.host}/api/card`
        })
            .then((response) => response.data)
            .then((collections) => collections.filter((collection: any) => collection.name.toLowerCase().startsWith('sendinblue')))
            .then((collections) =>
                collections.map((collection: any) => ({
                    name: collection.name,
                    id: collection.id
                }))
            )
            .catch(onError("cannot fetch sendinblue's questions on metabase"));
    }

    // https://www.metabase.com/docs/latest/api/card#post-apicardcard-idquery
    fetchContacts(questionId: number): Promise<Contact[]> {
        return this.makeRequest({
            method: 'POST',
            url: `${this.config.host}/api/card/${questionId}/query`
        })
            .then((response) => response.data.data)
            .then(({rows, cols}) => {
                return rows.map((row: any) => {
                    return row.reduce((acc: any, value: any, index: number) => {
                        acc[cols[index].name] = value;
                        return acc;
                    }, {});
                });
            })
            .catch(onError(`cannot run question ${questionId} on metabase`));
    }
}

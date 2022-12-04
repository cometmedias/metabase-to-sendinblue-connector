import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {onAxiosError, onError} from './error';
import {logger} from './logger';
import {Promise} from 'bluebird';

export interface MetabaseConfig {
    host: string;
    username: string;
    password: any;
}

export interface Question {
    id: number;
    name: string;
}

export interface Contact {
    email: string;
    [additionalProperties: string]: string | number | boolean;
}

export interface MetabaseContactList extends Question {
    contacts: Contact[];
}

export class MetabaseClient {
    private token: string | null = null;

    constructor(private config: MetabaseConfig) {}

    private async makeRequest(axiosConfig: AxiosRequestConfig): Promise<AxiosResponse> {
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
    private async authenticate(): Promise<void> {
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
    public async fetchQuestions(): Promise<Question[]> {
        return this.makeRequest({
            method: 'GET',
            url: `${this.config.host}/api/card`
        })
            .then((response) => response.data)
            .then((questions) => questions.map((question: any) => ({...question, name: question.name.toLowerCase()})))
            .then((questions) => questions.filter((question: any) => question.name.startsWith('sendinblue')))
            .then((questions) =>
                questions.map((question: any) => ({
                    name: question.name,
                    id: question.id
                }))
            )
            .catch(onError("cannot fetch sendinblue's questions on metabase"));
    }

    // https://www.metabase.com/docs/latest/api/card#post-apicardcard-idquery
    public async fetchContacts(questionId: number): Promise<Contact[]> {
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

    public async fetchContactLists(questions: Question[]): Promise<MetabaseContactList[]> {
        return Promise.map<Question, MetabaseContactList>(questions, async (question: Question) => ({
            ...question,
            contacts: await this.fetchContacts(question.id)
        }));
    }
}

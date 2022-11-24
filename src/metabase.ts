import axios, {AxiosRequestConfig} from 'axios';
import {onAxiosError, onError} from './error';
import {logger} from './logger';

export interface MetabaseConfig {
    host: string;
    username: any;
    password: any;
}

export class MetabaseClient {
    private token: string | null = null;

    constructor(private config: MetabaseConfig) {}

    private makeRequest(axiosConfig: AxiosRequestConfig) {
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

    private authenticate() {
        // https://www.metabase.com/docs/latest/api/session.html#post-apisession
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
    fetchAllQuestions(): Promise<any> {
        return this.makeRequest({
            method: 'GET',
            url: `${this.config.host}/api/card`
        }).catch(onError('cannot fetch all questions on metabase'));
    }

    // https://www.metabase.com/docs/latest/api/card#post-apicardcard-idquery
    runQuestionQuery(questionId: number) {
        return this.makeRequest({
            method: 'POST',
            url: `${this.config.host}/api/card/${questionId}/query`
        })
            .then((res) => res.data.data)
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

// const client = new MetabaseClient(config.metabase);

// client
//     .fetchAllQuestions()
//     .then((questions) => {
//         return questions.filter((question: any) => {
//             return question.name.startsWith('sendinblue');
//         });
//     })
//     .then((res) => {
//         return client.runQuestionQuery(res[0].id);
//     })
//     .then((res) => {
//         console.log('res', res);
//     })
//     .catch((error) => {
//         console.log('error', error);
//     });

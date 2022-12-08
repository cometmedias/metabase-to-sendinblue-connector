import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {onAxiosError, onError} from './error';
import {logger} from './logger';
import {Promise} from 'bluebird';
import {config} from './config';

export interface MetabaseConfig {
  host: string;
  username: string;
  password: any;
  collectionId: number;
}

export interface Question {
  id: 1;
  collection_position: number | null;
  collection_preview: boolean;
  description: string;
  display: string;
  entity_id: string;
  fully_parametrized: boolean;
  model: string;
  moderated_status: string | null;
  name: string;
  'last-edit-info': {
    id: number;
    last_name: string;
    first_name: string;
    email: string;
    timestamp: string;
  };
}

export interface DetailedQuestion {
  description: string;
  archived: boolean;
  collection_position: number | null;
  table_id: 42;
  result_metadata: {
    description: string | null;
    semantic_type: string | null;
    unit?: string;
    coercion_strategy: string | null;
    name: string;
    settings: string | null;
    field_ref: any[];
    effective_type: string;
    id: number;
    visibility_type: string;
    display_name: string;
    fingerprint: {
      global: any;
      type?: any;
    } | null;
    base_type: string;
  }[];
  creator: {
    email: string;
    first_name: string;
    last_login: string;
    is_qbnewb: boolean;
    is_superuser: boolean;
    id: number;
    last_name: string;
    date_joined: string;
    common_name: string;
  };
  can_write: boolean;
  database_id: number;
  enable_embedding: boolean;
  collection_id: number;
  query_type: string;
  name: string;
  last_query_start: string;
  dashboard_count: 0;
  average_query_time: number;
  creator_id: number;
  moderation_reviews: any[];
  updated_at: string;
  made_public_by_id: null;
  embedding_params: null;
  cache_ttl: null;
  dataset_query: {
    database: number;
    query: {
      'source-table': number;
      filter: any[];
    };
    type: string;
  };
  id: number;
  parameter_mappings: any[];
  display: string;
  entity_id: string;
  collection_preview: boolean;
  'last-edit-info': {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    timestamp: string;
  };
  visualization_settings: {
    'table.pivot_column': string;
    'table.cell_column': string;
  };
  collection: {
    authority_level: null;
    description: string;
    archived: boolean;
    slug: string;
    color: string;
    name: string;
    personal_owner_id: null;
    id: number;
    entity_id: string;
    location: string;
    namespace: null;
  };
  parameters: any[];
  dataset: boolean;
  created_at: string;
  public_uuid: string | null;
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
  public async fetchQuestionsFromCollection(collectionId: number): Promise<Question[]> {
    return this.makeRequest({
      method: 'GET',
      url: `${this.config.host}/api/collection/${collectionId}/items?models=card`
    })
      .then((response) => response.data.data as Question[])
      .catch(onError("cannot fetch sendinblue's questions on metabase"));
  }

  // // https://www.metabase.com/docs/latest/api/card#get-apicard
  public async fetchQuestion(id: number): Promise<DetailedQuestion> {
    return this.makeRequest({
      method: 'GET',
      url: `${this.config.host}/api/card/${id}`
    })
      .then((response) => response.data as DetailedQuestion)
      .catch(onError(`cannot fetch sendinblue's question ${id} on metabase`));
  }

  // https://www.metabase.com/docs/latest/api/card#post-apicardcard-idquery
  public async runQuestion(questionId: number): Promise<Contact[]> {
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
      contacts: await this.runQuestion(question.id)
    }));
  }
}

new MetabaseClient(config.metabase).fetchQuestion(1).then((res) => {
  console.log('res', JSON.stringify(res, null, 2));
});

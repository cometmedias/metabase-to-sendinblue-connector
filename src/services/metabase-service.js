import axios from 'axios';

class MetabaseServiceImpl {
    constructor(username, password) {
        this.baseUrl = process.env.METABASE_HOST;
        this.username = process.env.METABASE_USERNAME;
        this.password = process.env.METABASE_PASSWORD;
        this.collectionId = process.env.METABASE_COLLECTION_ID;

        if ([this.baseUrl, this.username, this.password, this.collectionId].some((env) => !env)) {
            throw new Error('An error occurred while instancing MetabaseService: Missing environment variables');
        }
    }

    async connect() {
        try {
            const response = await axios.post(`${this.baseUrl}/api/session`, {
                username: this.username,
                password: this.password
            });

            this.token = response.data.id;

            return this;
        } catch (error) {
            console.error('An error occurred while connecting to Metabase:', error.message);
            throw error;
        }
    }

    async request(method, path, body) {
        if (!this.token) {
            await this.connect();
        }

        try {
            const response = await axios.request({
                method,
                url: this.baseUrl + path,
                headers: {'X-Metabase-Session': this.token},
                body
            });

            return response.data;
        } catch (error) {
            console.error('An error occurred while requesting data:', error.message);
            throw error;
        }
    }

    async fetchContactLists() {
        try {
            const response = await this.request('get', `/api/collection/${this.collectionId}/items`);

            return response.data?.map((collection) => ({
                name: collection.name,
                id: collection.id
            }));
        } catch (error) {
            console.error('An error occurred while fetching lists:', error.message);
            throw error;
        }
    }

    async fetchContacts(contactList) {
        try {
            const response = await this.request('post', `/api/card/${contactList.id}/query`);

            const columns = response.data?.cols?.map((column) => column.name);
            const rows = response.data?.rows;

            return rows.map((row) => {
                return columns.reduce(
                    (acc, column, index) => ({
                        ...acc,
                        [column]: row[index]
                    }),
                    {}
                );
            });
        } catch (error) {
            console.error('An error occurred while fetching list contacts:', error.message);
            throw error;
        }
    }
}

export const MetabaseService = new MetabaseServiceImpl();

# Metabase to SendInBlue connector

Synchronize Metabase views with SendInBlue contact lists

# Development

## Environment variables

Copy `.env.dist` to `.env` and fill with your own values.

| Name                        | Description                                                       |
|-----------------------------|-------------------------------------------------------------------|
| METABASE_HOST               | (Optional) Metabase host uri. Default to https://www.metabase.com |
| METABASE_USERNAME           | (Required) Metabase service account username                      |
| METABASE_PASSWORD           | (Required) Metabase service account password                      |
| METABASE_COLLECTION_ID      | (Required) Metabase collection's id to synchronize                |
| SENDINBLUE_API_KEY          | (Required) SendInBlue API key                                     |
| BETTER_UPTIME_HEARTBEAT_URL | (Optional) Better UpTime heartbeat                                |

## Install dependencies

```shell
npm install
```

## Start

```shell
npm start
```

---

# Production

## Environment variables

Copy `terraform/tfvars/sample.tfvars` to `<workspace>.tfvars` and fill with your own values.

## Provisioning

```shell
cd terraform
tf init
tf workspace select <workspace>
tf apply -var-file=tfvars/<workspace>.tfvars
```

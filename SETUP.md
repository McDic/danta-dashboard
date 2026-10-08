# Setup

One-time setup for the Google Sheet, Google Cloud and GitHub. No long-lived keys are created:
CI authenticates with Workload Identity Federation, and local runs use your own `gcloud` login.

Replace `OWNER/REPO` with the GitHub repository (e.g. `mcdic/danta_dashboard`) throughout.

## 1. Mirror spreadsheet (keeps the other tabs unreachable)

Sharing grants access to a whole spreadsheet, not one tab. So the service account gets a separate
spreadsheet that contains only the exit records.

1. Create a new Google Sheet, e.g. "danta-dashboard-source". Rename its first tab to `실현손익 내역`.
2. In `A1` of that tab:
   ```
   =IMPORTRANGE("<URL of your original spreadsheet>", "실현손익 내역!A5:K")
   ```
   Click **Allow access** once. Row 1 is now the header and the records follow.
3. Note the mirror's spreadsheet ID: the part of its URL between `/d/` and `/edit`.

## 2. Google Cloud

```bash
PROJECT_ID=danta-dashboard-<something-unique>
REPO=OWNER/REPO

gcloud projects create "$PROJECT_ID"
gcloud config set project "$PROJECT_ID"
gcloud services enable sheets.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

# The identity that reads the sheet. It needs no project roles at all.
gcloud iam service-accounts create sheet-reader --display-name="Dashboard sheet reader"
SA="sheet-reader@$PROJECT_ID.iam.gserviceaccount.com"

# Trust GitHub Actions OIDC tokens, but only from this repository's main branch.
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc danta-dashboard \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/danta-dashboard"
echo "GCP_SERVICE_ACCOUNT=$SA"
```

Then share the **mirror** spreadsheet (not the original) with the `sheet-reader@…` email as **Viewer**,
with "Notify people" unchecked.

## 3. GitHub

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions**:
   - Secret `SHEET_ID`: the mirror's spreadsheet ID.
   - Variable `GCP_WORKLOAD_IDENTITY_PROVIDER`: printed above.
   - Variable `GCP_SERVICE_ACCOUNT`: printed above.
   - Variable `SHEET_RANGE` (optional): defaults to `'실현손익 내역'!A:K`.
3. Run the workflow from the **Actions** tab (**Deploy dashboard → Run workflow**) or push to `main`.

The workflow also runs on weekdays at 16:40 and 23:00 KST. GitHub pauses scheduled workflows in a
public repository after 60 days without commits; re-enable it from the Actions tab if that happens.

## 4. Local development

From a CSV export (**File → Download → CSV** on the `실현손익 내역` tab, saved as `format.csv`; `*.csv` is gitignored):

```bash
npm install
npm run data:csv   # writes public/data.json (gitignored)
npm run dev
```

From the sheet itself, as the same service account CI uses:

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.serviceAccountTokenCreator --member="user:$(gcloud config get account)"
gcloud auth application-default login --impersonate-service-account="$SA"

SHEET_ID=<mirror id> npm run data
```

## What is published

Only per-day aggregates (`shared/types.ts`): net/gross PnL, fees, round-trip and exit-leg turnover,
and position counts. Instrument codes, names, prices and contract counts never leave the build step:
`pipeline/publish-guard.ts` rejects any other field before `data.json` is written. Build errors name
row numbers and columns, never cell values, so the public Actions logs stay clean.

## Adding a product

`pipeline/products.ts` maps codes to multipliers. A trade in an unknown product fails the build with
"unknown product". Every row is also checked against `(exit − entry) × qty × multiplier − fee = 실현손익`,
so a wrong multiplier fails the build instead of producing wrong turnover.

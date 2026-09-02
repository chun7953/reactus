// src/config.js

import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_PORT = 8080;

export function parsePort(value, fallback = DEFAULT_PORT) {
    const candidate = value === undefined || value === '' ? fallback : Number(value);
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65535) {
        throw new RangeError('PORT must be an integer between 1 and 65535.');
    }
    return candidate;
}

export function buildConfig(environment = process.env) {
    return {
        discord: {
            token: environment.TOKEN,
            clientId: environment.CLIENT_ID,
        },
        web: {
            port: parsePort(environment.PORT),
        },
        database: {
            connectionString: environment.DATABASE_URL,
            migrationTargetConnectionString: environment.MIGRATION_TARGET_DATABASE_URL,
        },
        sheets: {
            spreadsheetId: environment.SPREADSHEET_ID,
            credentials: environment.GOOGLE_SHEETS_CREDENTIALS,
        },
    };
}

function validateGoogleCredentials(encodedCredentials) {
    try {
        const decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
        const credentials = JSON.parse(decoded);
        return Boolean(credentials?.client_email && credentials?.private_key);
    } catch {
        return false;
    }
}

export function validateRuntimeConfig(runtimeConfig) {
    const errors = [];
    const warnings = [];

    if (!runtimeConfig.discord.token) errors.push('TOKEN is required.');
    if (!runtimeConfig.database.connectionString) errors.push('DATABASE_URL is required.');

    if (!runtimeConfig.sheets.credentials) {
        warnings.push('GOOGLE_SHEETS_CREDENTIALS is not set; Google Calendar and backup features will be unavailable.');
    } else if (!validateGoogleCredentials(runtimeConfig.sheets.credentials)) {
        errors.push('GOOGLE_SHEETS_CREDENTIALS must be a base64-encoded service account JSON with client_email and private_key.');
    }

    if (!runtimeConfig.sheets.spreadsheetId) {
        warnings.push('SPREADSHEET_ID is not set; Google Sheets backup and restore features will be unavailable.');
    }

    return { errors, warnings };
}

export function assertRuntimeConfig(runtimeConfig) {
    const result = validateRuntimeConfig(runtimeConfig);
    if (result.errors.length > 0) {
        throw new Error(`Invalid runtime configuration:\n- ${result.errors.join('\n- ')}`);
    }
    return result.warnings;
}

export default buildConfig();

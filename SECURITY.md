# Security Documentation

> This document outlines security considerations for sb-mig CLI and sb-mig-gui.

## 🔐 Authentication & Credentials

### Credential Types

| Credential | Purpose | Permissions | Where Used |
|------------|---------|-------------|------------|
| **OAuth Token** | Management API authentication | Full write access to space | CLI, GUI |
| **Access Token (Preview)** | Delivery API authentication | Read draft content | Optional |
| **Access Token (Public)** | Delivery API authentication | Read published content only | Optional |

### OAuth Token

The OAuth token is a **personal access token** that grants full access to all Storyblok spaces the user has access to.

**How to obtain:**
1. Log in to [Storyblok](https://app.storyblok.com)
2. Go to **My Account** → **Personal access tokens**
3. Generate a new token

**Security implications:**
- ⚠️ Grants full read/write access to all your spaces
- ⚠️ Cannot be scoped to specific spaces
- ⚠️ Should be treated as a password
- ✅ Can be revoked at any time
- ✅ Can have expiration date

### Access Token

Access tokens are **space-specific** and grant read access via the Delivery API.

**Types:**
- **Preview token**: Can read draft (unpublished) content
- **Public token**: Can only read published content

**Security implications:**
- ✅ Scoped to single space
- ✅ Read-only access
- ⚠️ Preview token exposes unpublished content
- ✅ Can be regenerated in space settings

---

## 🔒 Credential Storage

### CLI Storage

**Environment Variables (Recommended):**
```bash
# .env file (never commit!)
STORYBLOK_OAUTH_TOKEN=your-oauth-token
STORYBLOK_SPACE_ID=your-space-id
STORYBLOK_ACCESS_TOKEN=your-access-token
```

**Configuration File:**
```javascript
// storyblok.config.js
module.exports = {
  oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,  // ✅ Reference env var
  // oauthToken: 'hardcoded-token',               // ❌ Never do this
};
```

**Best Practices:**
- ✅ Always use environment variables for secrets
- ✅ Add `.env` to `.gitignore`
- ✅ Use different tokens for development/production
- ❌ Never commit tokens to version control
- ❌ Never log tokens to console

### GUI Storage

The GUI stores credentials in a local SQLite database:

```
Location: ~/Library/Application Support/sb-mig-gui/settings.db (macOS)
          %APPDATA%/sb-mig-gui/settings.db (Windows)
```

**Storage mechanism:**
- SQLite database with key-value pairs
- File permissions set to user-only (0600)
- Not encrypted at rest

**Security considerations:**
- ⚠️ Tokens stored in plaintext in SQLite
- ⚠️ Accessible if machine is compromised
- ✅ Isolated to user's application data directory
- ✅ Not synced to cloud by default

**Future improvements:**
- [ ] Use OS keychain (Keychain on macOS, Credential Manager on Windows)
- [ ] Encrypt database at rest
- [ ] Add option to require password on app launch

---

## 🌐 Network Security

### API Communication

**Endpoints:**
- Management API: `https://mapi.storyblok.com/v1`
- Delivery API: `https://api.storyblok.com/v2`
- GraphQL API: `https://gapi.storyblok.com/v1`

**Security features:**
- ✅ All communication over HTTPS (TLS 1.2+)
- ✅ OAuth token sent in `Authorization` header
- ✅ No sensitive data in URL parameters
- ✅ Rate limiting enforced by Storyblok

**Request example:**
```
GET https://mapi.storyblok.com/v1/spaces/12345/stories/
Authorization: your-oauth-token
Content-Type: application/json
```

### Rate Limiting

sb-mig respects Storyblok's rate limits:
- Default: 2 requests per second
- Configurable via `rateLimit` config option
- Uses `storyblok-js-client` built-in rate limiter

---

## 📝 Data Handling

### What Data is Accessed

| Data Type | Operations | Risk Level |
|-----------|-----------|------------|
| Components | Read, Create, Update, Delete | Medium |
| Stories | Read, Create, Update, Delete | High |
| Assets | Read, Upload, Delete | Medium |
| Datasources | Read, Create, Update, Delete | Low |
| Roles | Read, Create, Update | High |
| Space Settings | Read only | Low |

### Data in Transit

- All API calls use HTTPS
- No caching of sensitive data in transit
- Request/response logging can be enabled (debug mode) - avoid in production

### Data at Rest

**Local files created by sb-mig:**

| File Type | Location | Contains Sensitive Data? |
|-----------|----------|-------------------------|
| Backup JSON files | `./sbmig/` | May contain content |
| Component schemas | `./src/`, `./storyblok/` | No |
| Config file | `./storyblok.config.js` | May reference env vars |
| Build cache | `./.next/cache/` | No |
| Test coverage | `./coverage/` | No |

---

## 🧪 Testing Security

### Test Environment Isolation

- Tests use **mock utilities** - no real API calls
- Mock tokens: `mock-oauth-token`, `mock-access-token`
- Mock space ID: `12345`
- Virtual file system for file operations

### Test Files Location

```
__tests__/
├── mocks/
│   ├── storyblokClient.mock.ts  # Contains mock tokens only
│   └── config.mock.ts           # Contains mock config only
└── fixtures/
    └── ...                      # Sample data, no real credentials
```

**Security notes:**
- ✅ No real credentials in test files
- ✅ Tests don't make network requests
- ✅ Test fixtures contain synthetic data only
- ✅ Coverage reports don't contain sensitive data

---

## ⚠️ Security Risks & Mitigations

### Risk 1: Credential Exposure

**Threat:** OAuth token leaked in logs, commits, or screenshots

**Mitigations:**
- sb-mig does not log credentials
- GUI masks token input fields
- Documentation warns against hardcoding tokens

**User actions:**
- Never commit `.env` files
- Review debug output before sharing
- Rotate tokens if exposed

### Risk 2: Malicious Schema Files

**Threat:** Code execution via malicious `.sb.js` files in `node_modules`

**Mitigations:**
- Only execute schema files from configured directories
- Use `import()` with limited scope
- Consider sandboxing in future

**User actions:**
- Review dependencies before installing
- Audit `componentsDirectories` configuration

### Risk 3: Cross-Space Access

**Threat:** Accidentally modifying wrong space

**Mitigations:**
- Space ID is explicit in configuration
- GUI shows active space prominently
- Sync operations confirm before destructive actions

**User actions:**
- Double-check `STORYBLOK_SPACE_ID`
- Use separate configs for dev/prod
- Review before using `--yes` flag

### Risk 4: Data Loss

**Threat:** `--ssot` flag or delete operations removing content

**Mitigations:**
- Confirmation prompts before destructive actions
- Automatic backup before `--ssot` sync
- Stories can be restored from Storyblok's Activity Log

**User actions:**
- Always backup before major operations
- Test in development space first
- Use version control for schema files

---

## 🔍 Logging & Debugging

### What Gets Logged

**Normal mode:**
- Command being executed
- Success/failure of operations
- Summary counts (X components synced)

**Debug mode (`debug: true`):**
- API request/response bodies
- Configuration values (tokens masked)
- File paths being processed

### Sensitive Data in Logs

- ✅ OAuth tokens are NOT logged
- ✅ Access tokens are NOT logged
- ⚠️ Story content may appear in debug output
- ⚠️ File paths may reveal system structure

### Log File Locations

sb-mig does not write log files by default. Output goes to stdout/stderr.

GUI stores terminal output in memory only - cleared on app restart.

---

## 🛡️ Best Practices

### For Developers

1. **Use environment variables**
   ```bash
   export STORYBLOK_OAUTH_TOKEN=xxx
   sb-mig sync components --all
   ```

2. **Use different tokens per environment**
   ```bash
   # .env.development
   STORYBLOK_OAUTH_TOKEN=dev-token
   STORYBLOK_SPACE_ID=dev-space
   
   # .env.production
   STORYBLOK_OAUTH_TOKEN=prod-token
   STORYBLOK_SPACE_ID=prod-space
   ```

3. **Limit OAuth token scope** (when Storyblok supports it)

4. **Rotate tokens periodically**

5. **Review before production sync**
   ```bash
   # Test in dev first
   sb-mig sync components --all --dry-run  # (future feature)
   ```

### For CI/CD

1. **Use secrets management**
   ```yaml
   # GitHub Actions
   env:
     STORYBLOK_OAUTH_TOKEN: ${{ secrets.STORYBLOK_OAUTH_TOKEN }}
   ```

2. **Limit token permissions** if possible

3. **Audit CI logs** for accidental exposure

4. **Use ephemeral runners** when possible

### For Teams

1. **Don't share personal OAuth tokens**

2. **Create separate tokens per team member**

3. **Use Storyblok's team permissions** alongside sb-mig

4. **Document which tokens are used where**

---

## 🚨 Incident Response

### If a Token is Compromised

1. **Immediately revoke the token** in Storyblok account settings
2. **Generate a new token**
3. **Update all systems** using the old token
4. **Review Storyblok Activity Log** for unauthorized actions
5. **Notify team** if shared resources affected

### If Data is Accidentally Deleted

1. **Check Storyblok Activity Log** for restore option
2. **Use local backups** if available (`./sbmig/` directory)
3. **Contact Storyblok support** for database restoration

---

## 📋 Security Checklist

### Before First Use
- [ ] OAuth token stored in environment variable
- [ ] `.env` added to `.gitignore`
- [ ] Correct space ID configured
- [ ] Tested in development space first

### Before Production Deployment
- [ ] Production tokens are separate from development
- [ ] CI/CD uses secrets management
- [ ] Destructive operations require confirmation
- [ ] Backup strategy in place

### Periodic Review
- [ ] Rotate OAuth tokens (quarterly recommended)
- [ ] Audit who has access to credentials
- [ ] Review Storyblok Activity Log
- [ ] Update dependencies for security patches

---

## 🔄 Dependency Security

### Key Dependencies

| Package | Purpose | Security Notes |
|---------|---------|----------------|
| `storyblok-js-client` | API communication | Official Storyblok package |
| `meow` | CLI argument parsing | Minimal attack surface |
| `dotenv` | Environment variable loading | Well-maintained |
| `rollup` + `@swc/core` | TypeScript compilation | Build-time only |
| `vitest` | Testing | Dev dependency only |

### Keeping Dependencies Updated

```bash
# Check for vulnerabilities
yarn audit

# Update dependencies
yarn upgrade-interactive

# Check for outdated packages
yarn outdated
```

**Recommended:**
- Run `yarn audit` in CI pipeline
- Enable Dependabot or similar for automated updates
- Review changelogs before major updates

---

## 📞 Reporting Security Issues

If you discover a security vulnerability in sb-mig:

1. **Do NOT open a public GitHub issue**
2. Email security concerns to: marckraw@icloud.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work on a fix promptly.

---

*Last updated: December 2024*

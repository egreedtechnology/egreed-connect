# EGREED Connect

MASTER PROMPT — Build EGREED Identity (Enterprise Identity & Access Management Platform)

You are acting as the Lead Software Architect, Lead Security Engineer, Lead Backend Engineer, Lead Frontend Engineer, DevOps Engineer, UI/UX Designer, Identity Engineer, and Technical Writer for the EGREED ecosystem.

Your task is to design and build EGREED Identity, a production-ready Identity and Access Management (IAM) platform that serves as the single authentication system for every EGREED product.

This is NOT just a login page.

This is the central identity provider for the entire EGREED ecosystem, similar in role to Google Account, Microsoft Account, Apple Account, GitHub, Auth0, Keycloak, Okta, and AWS IAM.

CORE MISSION

Create a scalable, modular, enterprise-grade identity platform.

Every current and future EGREED application must authenticate through this service.

Examples:

EGREED Cloud

EGREED AI

EGREED Mail

EGREED Drive

EGREED Browser

EGREED Learn

EGREED Deploy

EGREED SOS

Every future EGREED application

One account.

One identity.

One authentication system.

Multiple applications.

ARCHITECTURE PRINCIPLES

Never redesign from scratch.

Never remove existing features.

Always extend.

Always improve.

Always preserve compatibility.

Build using a modular architecture where every feature is independent but integrated.

Every page must communicate with the backend using reusable services.

Every component should be reusable.

Write production-quality code.

Avoid mock implementations unless explicitly requested.

SYSTEM DOMAINS

The platform should be designed around:

id.egreedtech.org

Future subdomains:

admin.id.egreedtech.org

developer.id.egreedtech.org

docs.id.egreedtech.org

api.id.egreedtech.org

status.id.egreedtech.org

DESIGN PHILOSOPHY

Create a premium modern interface.

Clean.

Minimal.

Professional.

Fast.

Responsive.

Accessible.

Use the official EGREED branding.

Every interaction should feel comparable to Google's or Microsoft's account experience while maintaining a unique EGREED visual identity.

MODULES TO BUILD

Build the platform as independent modules that work together.

These include (but are not limited to):

Authentication

Registration

Password Recovery

Email Verification

Phone Verification

Multi-Factor Authentication

Passkeys

Session Management

Device Management

Security Dashboard

Privacy Center

Connected Applications

OAuth 2.1 Provider

OpenID Connect Provider

API Key Management

Personal Access Tokens

Role-Based Access Control (RBAC)

Organizations

Teams

Permissions

Audit Logs

Notifications

Admin Portal

Developer Portal

API Documentation

SDK Downloads

Activity History

Security Alerts

Account Preferences

User Profile

Billing-ready architecture

Enterprise-ready architecture

SINGLE SIGN-ON

Implement centralized authentication.

Signing into one EGREED application automatically authenticates the user across all trusted EGREED applications.

Support secure session sharing and centralized logout.

SECURITY

Security is a first-class feature.

Design for:

Secure password hashing

JWT access tokens

Refresh tokens

Token rotation

Session expiration

Device trust

Login history

IP tracking

Suspicious activity detection

Rate limiting

Brute-force protection

CSRF protection

XSS prevention

Secure cookies

HTTPS-only communication

Content Security Policy

Audit logging

Every security decision should follow current industry best practices.

DEVELOPER PLATFORM

Build a complete developer experience.

Include:

Developer Console

API Keys

OAuth Clients

Client Secrets

Redirect URIs

Scopes

Webhooks

SDK Downloads

OpenAPI Specification

Swagger Documentation

API Playground

Code Examples

Versioned APIs

ORGANIZATION SUPPORT

Support organizations with:

Owners

Admins

Managers

Developers

Employees

Guests

Departments

Teams

Projects

Custom roles

Permission inheritance

DOCUMENTATION

Every feature must be documented.

Automatically generate documentation for:

REST APIs

Authentication

SDKs

Examples

Error Codes

Security

OAuth

OpenID Connect

Developer Tutorials

Migration Guides

Troubleshooting

FUTURE EXPANSION

Design the platform to support future capabilities such as:

Enterprise SSO (SAML)

SCIM provisioning

Federation with external identity providers

Third-party applications

Marketplace integrations

AI agents

Machine identities

Service accounts

Cross-region deployments

High availability

DEVELOPMENT WORKFLOW

Work incrementally.

Whenever I say:

"Refine this page"

you should:

Analyze the current implementation.

Identify missing functionality.

Improve the user experience.

Improve accessibility.

Improve responsiveness.

Improve security.

Connect it to the appropriate backend services.

Remove bugs.

Refactor duplicated code.

Preserve compatibility with the rest of the platform.

Never introduce breaking changes without explanation.

Whenever I say:

"Implement"

assume I want production-quality functionality, not placeholders.

Whenever I say:

"Improve"

enhance the existing implementation while keeping its purpose intact.

Whenever I say:

"Continue"

pick up from the current architecture and extend it consistently.

ENGINEERING STANDARDS

Generate maintainable, readable, documented code.

Separate concerns clearly.

Use reusable components.

Follow secure coding practices.

Validate all inputs.

Handle all errors gracefully.

Use strong typing where applicable.

Optimize performance.

Design APIs to be versioned.

Ensure all pages are mobile-friendly.

Avoid technical debt.

Think like a senior engineering team building a platform that will scale to millions of users.

Your goal is not to create a demo—it is to build the long-term identity foundation for the entire EGREED ecosystem.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c8e4f0bd-2ee1-4a48-a986-c80f5df52f85).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

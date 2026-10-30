---
platforms: Web, Android, iOS
status: Proposed
title: Communication System --- App Flow
version: 1.0
---

# Communication System --- App Flow

**Version:** 1.0\
**Status:** Proposed\
**Platforms:** Web, Android, iOS\
**Architecture assumption:** Matrix-first, pending validation during
Phase 0\
**Initial release scope:** One-to-one end-to-end encrypted text
messaging

> **Core principle:** The interface must never imply that a conversation
> is encrypted, a device is trusted, or a message was delivered unless
> the underlying protocol state supports that claim.

## 1. Purpose and Scope

This document defines the expected user journeys and screen transitions
for Communication System. It supports product, UX, frontend, backend,
QA, and AI-assisted implementation, and complements the PRD, TRD, UI/UX
brief, backend schema, and implementation plan.

Goals: - Describe the main path from launch to a secure direct
conversation. - Define navigation and core screen responsibilities. -
Specify alternate paths and recovery states. - Make privacy and
device-security behavior visible. - Provide implementation and
manual-verification checklists.

The exact authentication and cryptographic setup screens depend on the
selected Matrix SDK and deployment. Do not design the UI around
unsupported protocol behavior.

## 2. High-Level App Flow

``` mermaid
flowchart TD
    A[Launch application] --> B[Load configuration and restore session]
    B --> C{Valid session?}
    C -- No --> D[Welcome / Sign in / Register]
    D --> E[Authentication result]
    E --> F[Secure device setup]
    C -- Yes --> G[Initialize crypto and sync]
    F --> G
    G --> H{Ready?}
    H -- No --> I[Recovery / Error]
    H -- Yes --> J[Home]
    J --> K[Chats list]
    J --> L[People]
    J --> M[Settings]
    K --> N[Open conversation]
    K --> O[New conversation]
    L --> P[Select discoverable person]
    O --> P
    P --> Q[Direct chat screen]
    N --> Q
    Q --> R[Send encrypted message]
    Q --> S[Conversation details]
    Q --> T[Security warning]
    S --> U[Device and security controls]
    T --> V[Verify / Review / Cancel]
```

## 3. Navigation Model

  -----------------------------------------------------------------------
  Primary area            Purpose                 Key destinations
  ----------------------- ----------------------- -----------------------
  **Chats**               Daily messaging and     Conversation list,
                          conversation management direct chat,
                                                  conversation details

  **People**              Find people the user is Search, public profile,
                          permitted to discover   start conversation,
                                                  block/report

  **Settings**            Account, privacy,       Profile,
                          devices, and            security/devices,
                          application preferences privacy, notifications,
                                                  blocked users, help,
                                                  deletion
  -----------------------------------------------------------------------

On desktop, use a persistent navigation rail or sidebar where
appropriate. On mobile, use a compact bottom navigation or another
platform-appropriate pattern. Keep the current conversation primary
while making security and profile actions available through conversation
details.

## 4. Screen Inventory

  -----------------------------------------------------------------------
  Screen                  Purpose and essential   Primary actions
                          states                  
  ----------------------- ----------------------- -----------------------
  Welcome                 Explain the product and Sign in, create
                          privacy model; loading  account, read privacy
                          and service-unavailable information
                          states                  

  Authentication          Registration/sign-in,   Submit credentials,
                          validation errors,      retry, recover access
                          rate-limit and network  where supported
                          states                  

  Secure device setup     Show device setup and   Continue setup, verify
                          encryption readiness;   device, review recovery
                          distinguish setup from  guidance
                          verification            

  Home / Chats            Conversation list,      Open chat, search,
                          unread indicators,      start conversation
                          empty, loading, offline 
                          and sync-error states   

  People / Search         Only discoverable       Open profile, start
                          profiles; no leakage of chat, block/report
                          hidden users            where allowed

  Profile                 Display and permitted   Edit profile, message,
                          editable profile fields block/report

  Direct chat             Encrypted text          Send, retry, open
                          conversation, message   details, review
                          states, key/device      security warning
                          warnings, offline state 

  Conversation details    Participants and        View device identity,
                          relevant security state verify, block/report

  Devices & security      Active devices,         Verify, revoke
                          verification state and  session/device, review
                          sessions                security guidance

  Privacy                 Discoverability,        Change settings and
                          presence and            understand their effect
                          read-receipt controls   
                          where supported         

  Notifications           Push and preview        Enable/disable
                          preferences             notifications, choose
                                                  preview behavior

  Blocked users           Current block list and  Unblock, view permitted
                          empty/error states      profile details

  Reports                 Submission confirmation Submit report, review
                          and user-visible report status
                          status if supported     

  Account deletion        Consequences,           Confirm deletion,
                          confirmation,           cancel if allowed, view
                          processing and failure  status
                          states                  

  Error / recovery        Network, session, sync, Retry, sign in again,
                          crypto and service      follow recovery
                          failures                instructions
  -----------------------------------------------------------------------

## 5. Core User Journeys

### 5.1 First-Time User

``` mermaid
flowchart TD
    A[Launch] --> B[Welcome]
    B --> C[Register]
    C --> D[Authentication success]
    D --> E[Secure device setup]
    E --> F[Encryption initialization]
    F --> G[Initial sync / loading]
    G --> H[Empty Chats screen]
    H --> I[Start a conversation]
    I --> J[Select discoverable person]
    J --> K[Open direct chat]
    K --> L[Review device/security state]
```

Requirements: - Do not present the chat composer as ready until required
cryptographic initialization has succeeded. - Explain device
verification in plain language and make verification state
discoverable. - If account creation or cryptographic setup fails,
preserve safe progress where possible and show a recoverable error.

### 5.2 Returning User

``` mermaid
flowchart TD
    A[Launch] --> B[Restore session]
    B --> C{Session valid?}
    C -- No --> D[Authenticate again]
    C -- Yes --> E[Initialize supported crypto state]
    E --> F[Sync]
    F --> G[Chats list]
    G --> H[Open conversation]
    H --> I[Continue messaging]
```

Requirements: - If the session has expired, redirect to authentication
without exposing private conversation content. - If cryptographic state
is unavailable or needs user action, show the appropriate recovery or
verification path. - Do not silently create a new identity or device
when doing so could confuse device trust or key continuity.

### 5.3 Start and Send a Direct Message

``` mermaid
sequenceDiagram
    participant S as Sender Client
    participant HS as Matrix Homeserver
    participant R as Recipient Client
    S->>S: Compose and encrypt locally
    S->>HS: Submit encrypted event
    HS-->>S: Protocol acceptance result
    R->>HS: Sync for new events
    HS-->>R: Encrypted event
    R->>R: Decrypt using supported SDK
```

Requirements: - A local send attempt is not the same as server
acceptance, delivery, or reading. - Show pending, failed, delivered, or
read states only when the system can substantiate them. - Use safe
retry/idempotency behavior to avoid accidental duplicate effects. - If a
device is unverified or a message cannot be decrypted, explain the issue
without pretending the message is safe or readable. - A device that
skipped secure setup opens the app with a persistent unverified-device
notice (enter the recovery key, or verify from another device) rather
than being sent back to setup on every start (ADR-0003 D5, amended
2026-10-31).

### 5.4 Verify a Device or Respond to an Identity Change

``` mermaid
flowchart TD
    A[Security indicator or warning] --> B[Device details]
    B --> C[Explain identity change or unverified state]
    C --> D[User reviews identity details]
    D --> E[Supported verification flow]
    E --> F{Verification result}
    F -- Success --> G[Show verified state]
    F -- Cancelled / Failed --> H[Keep warning visible]
    G --> I[Return to chat or continue]
    H --> I
```

Use the protocol's supported verification flow. Do not invent a custom
trust badge or mark a device verified merely because the user dismissed
a warning.

### 5.5 Offline and Reconnect

``` mermaid
flowchart TD
    A[Network unavailable] --> B[Show offline state]
    B --> C[Allow safe local navigation]
    C --> D{Send action}
    D -- Queued send supported --> E[Show pending state]
    D -- Not supported --> F[Explain message was not sent]
    E --> G[Network restored]
    F --> G
    G --> H[Resume sync / retry safely]
    H --> I[Reconcile event state]
    I --> J[Show success or actionable failure]
```

### 5.6 Block and Report

``` mermaid
flowchart TD
    A[Profile or conversation details] --> B[Choose Block or Report]
    B --> C[Explain effect / collect category and optional evidence]
    C --> D[Confirm action]
    D --> E[Enforce server-side permissions]
    E --> F[Show result]
    F --> G[Update relevant UI and lists]
```

Requirements: - Blocking must have a clearly documented effect on future
interactions and discovery. - Reporting must be explicit; only evidence
the user intentionally submits may be sent to moderation. - Do not
promise that a report has been reviewed or resolved unless the backend
state confirms it.

### 5.7 Account Deletion

``` mermaid
flowchart TD
    A[Settings] --> B[Account]
    B --> C[Delete account]
    C --> D[Explain consequences, retention and recovery limits]
    D --> E[Re-authenticate / confirm]
    E --> F[Create deletion request]
    F --> G[Process application data and Matrix-related steps]
    G --> H{Workflow result}
    H -- Completed --> I[Show completion]
    H -- Processing --> J[Show progress]
    H -- Failed --> K[Show failure and safe retry/support path]
```

Requirements: - Deletion must be authenticated, confirmed, and safe to
retry. - Explain backup retention and any legally required retention
accurately. - Do not show completion until the defined deletion workflow
reports completion.

## 6. State and Error Handling

  -----------------------------------------------------------------------
  Condition               Expected behavior       Must not happen
  ----------------------- ----------------------- -----------------------
  No network              Show offline status;    Claim a message was
                          preserve safe local     sent when it was not
                          state; retry when       accepted
                          appropriate             

  Expired session         Ask the user to         Expose protected data
                          authenticate again      or silently create a
                                                  new identity

  Cryptographic           Block unsafe messaging  Fall back to plaintext
  initialization failure  actions and show        
                          recovery guidance       

  Unverified device       Show clear warning and  Mark as trusted without
                          supported verification  verification
                          options                 

  Undecryptable event     Show an honest          Invent message content
                          placeholder and         or silently hide the
                          recovery/help options   issue

  Duplicate retry         Use supported           Create unintended
                          idempotency and         duplicate messages or
                          reconciliation          reports

  Rate limit              Explain retry           Retry aggressively in a
                          availability without    loop
                          leaking security        
                          internals               

  Deletion step failure   Retain workflow status  Claim completion while
                          and support safe retry  required steps remain
                                                  unfinished

  Permission denied       Show a generic, safe    Reveal another user's
                          error and preserve      private data
                          authorization boundary  
  -----------------------------------------------------------------------

## 7. Security and Privacy Requirements

-   Use supported Matrix client SDKs and protocol APIs if Matrix is
    approved in Phase 0.
-   Never implement cryptographic primitives or messaging protocols from
    scratch.
-   Never silently downgrade encrypted messaging to plaintext.
-   Never store private encryption keys or decrypted message bodies in
    application-owned MongoDB collections.
-   Use secure session handling and platform-appropriate storage for
    sensitive client state.
-   Apply authorization and privacy settings on the server, not only in
    the client.
-   Use generic push notification content by default; do not expose
    message previews unless the user has explicitly enabled supported
    preview behavior.
-   Keep secrets, tokens and message plaintext out of logs and
    analytics.
-   Make data retention, reporting and deletion behavior explicit.

## 8. Accessibility, Localization and Responsive Behavior

-   Support keyboard navigation and visible focus states on web.
-   Provide accessible names and status announcements for interactive
    controls.
-   Use clear contrast, readable type sizes, and consistent spacing.
-   Design loading, empty, error, and offline states rather than only
    the happy path.
-   Plan for English, Bengali, and Arabic, including right-to-left
    layout and mixed-direction message content.
-   Ensure timestamps, message ordering, and text direction remain
    correct across locales.
-   Use responsive layouts for desktop, tablet, and mobile browser
    widths.

## 9. Implementation Order

  -----------------------------------------------------------------------
  Order                   Deliverable             Exit check
  ----------------------- ----------------------- -----------------------
  1                       Phase 0 architecture    Two accounts exchange
                          spike                   an encrypted message;
                                                  SDK, licensing, and
                                                  platform feasibility
                                                  verified

  2                       App shell and design    Navigation, responsive
                          system                  shell,
                                                  lint/type/test/build
                                                  pipeline pass

  3                       Authentication and      Session lifecycle,
                          device setup            device identity, and
                                                  verification behavior
                                                  tested

  4                       Encrypted direct chat   Send, receive, sync,
                                                  retry, and failure
                                                  cases tested

  5                       Web completeness        Primary web journeys
                                                  and accessibility
                                                  checks pass

  6                       Mobile clients          Android/iOS builds and
                                                  cross-platform
                                                  messaging verified

  7                       Application API and     Profile, privacy,
                          MongoDB                 blocking, reporting,
                                                  and deletion endpoints
                                                  tested

  8                       Security hardening      Threat-model checks,
                                                  authorization tests,
                                                  backup and recovery
                                                  tests pass

  9                       Closed beta             Release criteria,
                                                  support, monitoring,
                                                  and rollback procedures
                                                  ready
  -----------------------------------------------------------------------

## 10. Manual Verification Checklist

-   [ ] A new user can register and reach secure device setup.
-   [ ] A returning user can restore a valid session.
-   [ ] Two distinct accounts exchange an encrypted direct message.
-   [ ] The recipient can decrypt the message on an authorized device.
-   [ ] The server does not receive ordinary direct-message plaintext in
    the approved encrypted flow.
-   [ ] Device verification state is visible and accurate.
-   [ ] A session/device can be revoked using the supported mechanism.
-   [ ] Offline, reconnect, and retry paths do not create unintended
    duplicates.
-   [ ] An undecryptable message is handled honestly and safely.
-   [ ] Privacy settings are enforced by the backend.
-   [ ] Blocking changes permitted interactions as documented.
-   [ ] Report submission shares only explicitly selected evidence.
-   [ ] Account deletion requires confirmation and handles partial
    failure.
-   [ ] No secrets or message plaintext appear in logs.
-   [ ] Web, Android, and iOS build and run on supported configurations.
-   [ ] Keyboard, responsive layout, and localization behavior have been
    checked.

## 11. Open Decisions

Resolve architecture-level decisions during Phase 0 and record them in
an architecture decision record.

-   Final Matrix homeserver and deployment model.
-   Exact supported web and mobile SDKs, including license and
    maintenance review.
-   Whether mobile can share a unified codebase while meeting encryption
    requirements.
-   Authoritative location for profile, privacy, and blocking settings.
-   Username/discovery model and anti-enumeration controls.
-   Push notification integration and supported privacy controls.
-   Media support scope and encrypted upload design.
-   Account deletion semantics, backup retention, and any legal
    retention requirements.
-   Supported browsers, operating-system versions, and beta release
    channels.

Do not let the UI imply capabilities that have not been validated by the
selected protocol and SDK.

## 12. Definition of Done

-   [ ] The implemented flow matches approved requirements and
    architecture decisions.
-   [ ] Happy paths and relevant error paths are covered by tests.
-   [ ] Lint, type checks, tests, and production builds pass, or
    limitations are explicitly documented.
-   [ ] Security-sensitive behavior has been verified at the correct
    system boundary.
-   [ ] Relevant documentation and project status are updated.
-   [ ] Manual verification results are recorded.
-   [ ] The change is reviewed and committed only when authorized.
-   [ ] The current phase exit gate is evaluated before starting the
    next phase.

## 13. Change History

  -----------------------------------------------------------------------
  Version                 Change                  Status
  ----------------------- ----------------------- -----------------------
  1.0                     Initial app flow        Proposed
                          specification based on  
                          the Communication       
                          System product plan     

  -----------------------------------------------------------------------

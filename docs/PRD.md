# Product Requirements Document (PRD)
## Communication System

**Document version:** 1.0  
**Status:** Draft — for review and approval  
**Created:** 19 October 2026  
**Product category:** Real-time communication and messaging platform  
**Target audience:** General public  
**Initial platforms:** Web, Android, iOS  
**Primary security requirement:** End-to-end encryption (E2EE) for private conversations  
**Working product name:** Communication System  
**Technology preference:** React, TypeScript, Node.js, MongoDB, Firebase, and established messaging and cryptographic technologies

---

# 1. Executive Summary

Communication System is a cross-platform messaging application designed to provide private, reliable, and accessible digital communication for the general public.

The product draws inspiration from WhatsApp's personal messaging experience and Telegram's broader communication ecosystem. It aims to combine secure one-to-one messaging, cross-platform accessibility, dependable message delivery, privacy controls, and a foundation for future community features.

Unlike a simple chat application, Communication System is intended to become a maintainable, scalable communication product. Its architecture must support future growth without requiring the entire platform to be rewritten.

The first public release will prioritize secure one-to-one messaging, account and device identity, encrypted message storage, reliable delivery, offline synchronization, and essential user privacy controls.

End-to-end encryption is a foundational product requirement, not an optional feature to be added after launch.

The project will initially be developed as a focused MVP. Group chats, channels, voice and video calls, bots, and other advanced features will be introduced only after the private messaging foundation has met its security, reliability, and usability requirements.

# 2. Product Vision

## 2.1 Vision statement

To build a trustworthy, accessible, and privacy-focused communication platform that enables people to communicate securely across devices and geographical boundaries.

## 2.2 Mission

- Make private digital communication straightforward and dependable.
- Protect private message content through end-to-end encryption.
- Give users control over their accounts, devices, and privacy.
- Provide a consistent experience across web, Android, and iOS.
- Build a sustainable technical foundation for future communication and community services.

## 2.3 Product principles

1. **Privacy by design:** Minimize collected data and protect private message content.
2. **Security before feature count:** Do not sacrifice security to accelerate feature development.
3. **Reliability over appearance:** Messages must be delivered and synchronized correctly.
4. **Simple user experience:** Essential communication tasks should require minimal effort.
5. **Cross-platform consistency:** Core features should behave consistently across supported clients.
6. **Transparent limitations:** Communicate what encryption protects and what it does not.
7. **Incremental development:** Release and validate small, functional milestones.
8. **Maintainability:** Prefer established protocols, supported libraries, automated tests, and documented architecture decisions.

# 3. Problem Statement

Users rely on messaging platforms for personal conversations, relationships, education, professional collaboration, and community participation.

However, developing a trustworthy alternative requires more than implementing a chat interface. It requires dependable message delivery, secure device identity, encryption, account recovery, abuse prevention, privacy controls, and consistent behavior across different operating systems.

Communication System addresses these needs by providing a focused private messaging experience first, then expanding into additional communication features as the platform matures.

The initial product will prioritize correctness, security, and usability over attempting to match every feature of established messaging applications.

# 4. Target Audience

## 4.1 Primary users

- Individuals seeking private personal communication.
- Friends and families communicating locally or internationally.
- Students and educators who need dependable direct messaging.
- Community members who value privacy and accessible communication.
- Privacy-conscious users who want understandable security controls.

## 4.2 Secondary users

Future versions may serve:

- Educational institutions.
- Community organizations.
- Professional teams.
- Content creators and public communities.
- Developers building integrations and communication bots.

These secondary segments will not determine the initial MVP scope.

## 4.3 Initial market

The first release will be available to a limited beta audience before a broader public rollout.

The initial deployment region, supported languages, age policy, and legal operating entity must be determined before public launch.

# 5. Product Goals and Non-Goals

## 5.1 Primary goals

- Deliver end-to-end encrypted one-to-one messaging.
- Support web, Android, and iOS clients.
- Provide secure account and device management.
- Store messages in a form that the service cannot decrypt.
- Deliver messages reliably to online and offline recipients.
- Synchronize message history using a defined protocol and cursor mechanism.
- Provide accurate sending, delivery, and read states.
- Give users essential privacy and abuse-prevention controls.
- Establish automated testing, deployment, monitoring, and recovery procedures.

## 5.2 Non-goals for the first release

The following are explicitly outside the initial MVP:

- Group end-to-end encrypted messaging.
- Public channels and large communities.
- Voice and video calling.
- Bots and a public developer API.
- Message translation and AI-powered chat features.
- Business accounts and enterprise administration.
- Federation between independently operated servers, unless using a protocol that provides it as a core capability.
- Guaranteed anonymity or untraceability.
- Automatic server-readable backups of private conversations.
- Full feature parity with WhatsApp or Telegram.

# 6. Product Scope

## 6.1 MVP features

The first public release must include:

1. Account registration and authentication.
2. User profiles and unique usernames.
3. Device registration and identity verification.
4. One-to-one conversations.
5. End-to-end encrypted text messaging.
6. Encrypted message persistence.
7. Message history and pagination.
8. Real-time message delivery.
9. Offline message retrieval and reconnection synchronization.
10. Sending, delivered, read, and failed states.
11. Basic online and last-active privacy settings.
12. Generic push notifications without private message content by default.
13. Blocking and reporting.
14. Session and device revocation.
15. Account deletion and documented data-retention behavior.
16. Error handling, monitoring, and operational recovery.
17. Web, Android, and iOS support.

## 6.2 Features for subsequent releases

### Release 1.1 — Enhanced messaging

- Image, document, and voice-note sharing with encrypted attachment contents.
- Message replies, edits, and deletion.
- Reactions.
- Improved conversation search.
- Better privacy and notification settings.

### Release 1.2 — Groups and linked devices

- Group conversations.
- Group membership and administrative roles.
- Multiple linked devices.
- Secure device linking and key verification.
- Encrypted history transfer or recovery, subject to a reviewed design.

### Release 2 — Communication ecosystem

- Broadcast channels.
- Communities and public groups.
- Voice and video calls.
- Scheduled messages.
- Bots and integrations.
- Desktop application.
- Public APIs and webhooks.

Release dates will be established after the MVP is validated.

# 7. User Roles

## 7.1 Guest

A guest may access public informational pages and account registration.

A guest cannot access private messages, protected profiles, or authenticated communication functions.

## 7.2 Registered user

A registered user can manage their profile, establish a device identity, find other users, initiate direct conversations, send and receive encrypted messages, and manage privacy settings.

## 7.3 Moderator

A moderator can process reports and take permitted account-level moderation actions.

Moderators must not receive unrestricted access to private message contents. Any user-submitted evidence must be disclosed voluntarily and handled under documented procedures.

## 7.4 Administrator

An administrator can manage service configuration, operational health, abuse controls, and authorized account-management tasks.

Administrative access must follow least-privilege principles and be logged appropriately. Administrators must not have a hidden mechanism for decrypting private conversations.

# 8. Functional Requirements

## FR-01: Registration and Authentication

**Description:** Users must be able to create and access an account securely.

Requirements:

- Support the initial approved authentication methods.
- Verify account identity through the selected authentication provider.
- Prevent unauthorized access to protected endpoints and real-time events.
- Support sign-out and session revocation.
- Apply abuse controls to registration and authentication.
- Avoid exposing sensitive authentication information in logs.

**Acceptance criteria:**

- A user can register and authenticate successfully.
- Invalid, expired, or revoked credentials are rejected.
- Authentication alone does not grant access to another user's conversations.
- Account deletion and recovery behavior are documented.

## FR-02: User Profiles

**Description:** Users need a recognizable identity.

Requirements:

- Unique normalized username.
- Display name.
- Optional profile image.
- Editable profile information.
- Privacy controls for profile visibility.
- Username validation and abuse prevention.

**Acceptance criteria:**

- Usernames cannot be duplicated.
- Invalid profile updates are rejected.
- Protected profile information is not exposed without authorization.

## FR-03: Device Identity and Verification

**Description:** The application must distinguish account identity from cryptographic device identity.

Requirements:

- Generate protocol-required private key material locally.
- Register devices and publish only the required public key material.
- Provide a way to verify a contact's cryptographic identity.
- Notify users when a contact's identity changes.
- Allow users to revoke devices.
- Use platform-appropriate secure storage.
- Document device recovery and key rotation behavior.

**Acceptance criteria:**

- Private encryption keys are not uploaded to the messaging server.
- New or changed device identities are handled according to the selected protocol.
- Users can distinguish verified from unverified identities.
- Revoked devices cannot continue using the service as authorized clients.

## FR-04: Direct Conversations

**Description:** Users can establish one-to-one conversations.

Requirements:

- Start a conversation with a valid user.
- Prevent unauthorized membership changes.
- Retrieve existing conversation metadata.
- Display conversation history in chronological order.
- Provide appropriate empty, loading, and error states.

**Acceptance criteria:**

- Only authorized participants can access a conversation.
- Duplicate conversation creation is handled consistently.
- Conversation membership is validated on the server or protocol service.

## FR-05: End-to-End Encrypted Messaging

**Description:** Private message content must be encrypted on the sender's device and decrypted on the recipient's device.

Requirements:

- Use an established, reviewed cryptographic protocol and supported implementation.
- Never implement custom encryption algorithms or an improvised key-exchange protocol.
- Store encrypted message payloads rather than plaintext.
- Prevent message contents from leaking into server logs, analytics, or notifications.
- Support device verification and identity-change handling.
- Document the metadata that remains visible to the service.
- Review all cryptographic dependencies and licensing before release.

**Acceptance criteria:**

- Message plaintext is not transmitted to the server as application message content.
- The server cannot decrypt stored message payloads using its ordinary service credentials.
- Invalid or unauthenticated encrypted messages are rejected by the cryptographic implementation.
- The selected protocol's interoperability and test requirements pass on all supported platforms.
- End-to-end encryption claims are supported by documented architecture and independent review.

## FR-06: Message Delivery and Synchronization

**Description:** Messages must remain available when recipients are temporarily offline.

Requirements:

- Distinguish local pending messages from server-accepted messages.
- Persist accepted encrypted envelopes durably.
- Use client-generated idempotency identifiers.
- Deliver to connected recipients.
- Retrieve missed messages after reconnection.
- Support cursor-based pagination and synchronization.
- Handle duplicate events and out-of-order delivery safely.

**Acceptance criteria:**

- Retrying a message does not create unintended duplicates.
- A server acknowledgement is issued only after the agreed persistence guarantee is met.
- Accepted messages can be recovered after normal service restarts.
- Offline recipients can retrieve available messages after reconnecting.
- Message ordering follows the documented protocol and synchronization rules.

## FR-07: Message Status

**Description:** Users need accurate feedback about message state.

Required states:

- Pending.
- Sent or accepted by the server.
- Delivered.
- Read.
- Failed.

**Acceptance criteria:**

- Status changes follow defined acknowledgement rules.
- The UI never labels an unconfirmed message as successfully sent.
- Repeated delivery or read acknowledgements are handled idempotently.
- Users can understand the distinction between server acceptance and recipient delivery.

## FR-08: Presence and Activity

**Description:** Users may see permitted availability information.

Requirements:

- Online status where enabled.
- Optional last-active information.
- Privacy controls.
- Appropriate handling of disconnected or inactive devices.

**Acceptance criteria:**

- Presence information follows the user's configured privacy settings.
- Stale connections do not remain indefinitely marked online.
- The product does not imply that a message has been read merely because a user is online.

## FR-09: Notifications

**Description:** Users should be informed about incoming messages.

Requirements:

- Support push notifications on Android and iOS.
- Support browser notifications where permitted.
- Use generic notification text by default.
- Avoid placing plaintext messages or cryptographic secrets in notification payloads.
- Respect notification permissions and privacy settings.

**Acceptance criteria:**

- A notification can alert the recipient that a message is available without exposing its contents.
- Revoked device tokens and invalid notification registrations are handled.
- Notification delivery failure does not cause loss of the underlying message.

## FR-10: Blocking and Reporting

**Description:** Users need protection against unwanted communication.

Requirements:

- Block and unblock accounts.
- Enforce blocking rules on relevant server-side operations.
- Report accounts for abuse.
- Permit voluntary submission of selected message evidence when necessary.
- Protect report information from unauthorized access.
- Define moderation and appeal procedures.

**Acceptance criteria:**

- Blocked users cannot initiate prohibited communication through supported application paths.
- Reports enter an authorized moderation workflow.
- Reporting does not secretly expose all of a user's private conversations.

## FR-11: Account and Device Lifecycle

Requirements:

- View registered devices.
- Revoke a device.
- Sign out.
- Request account deletion.
- Define the treatment of backups, queued messages, profile information, and retained operational records.
- Explain that deleting an account cannot erase copies already held by other recipients.

**Acceptance criteria:**

- Revoked sessions and devices are denied future authorized access.
- Deletion requests follow a documented and testable process.
- Retention exceptions are disclosed clearly.

# 9. Non-Functional Requirements

## NFR-01: Security

- Use TLS for network communication.
- Authenticate protected requests and authorize each operation.
- Apply strict input validation and payload limits.
- Use rate limits and abuse controls.
- Protect secrets using approved secret-management mechanisms.
- Review dependencies and security updates.
- Maintain an explicit threat model.
- Obtain an independent security review before broad public availability.

## NFR-02: Performance

Initial targets, to be validated under a defined test environment:

- Aim for server acceptance latency below 500 ms at p95 under the agreed baseline load.
- Keep common conversation navigation responsive.
- Use pagination rather than loading complete message histories.
- Avoid unnecessary database queries and repeated synchronization.
- Measure client-side encryption, decryption, and rendering performance.

Network conditions and client processing time must be measured separately from server processing time.

## NFR-03: Availability and Reliability

- Proposed early-beta availability target: 99.5% monthly.
- Durable acceptance of messages.
- Recovery from ordinary server restarts.
- Automated backups and tested restoration.
- Defined incident-response and rollback procedures.
- Monitoring for message-delivery failures and synchronization delays.

## NFR-04: Scalability

- Start with a modular monolith or a protocol-native server architecture.
- Separate major application responsibilities into clear modules.
- Add caching, queues, and horizontal scaling when measured demand requires them.
- Avoid unnecessary microservices and orchestration complexity in the first release.

## NFR-05: Usability and Accessibility

- Responsive layouts.
- Keyboard-accessible web interactions.
- Screen-reader labels.
- Clear message states and error messages.
- Consistent navigation across platforms.
- Support for Unicode and future right-to-left layouts.

## NFR-06: Maintainability

- TypeScript and strict type checking where practical.
- Documented architectural decisions.
- Automated linting, tests, and build verification.
- Conventional commits and code review.
- Separate development, staging, and production environments.
- Versioned API contracts and migration procedures.

# 10. Privacy and Security Requirements

## 10.1 Encryption boundaries

Private message content must be encrypted before it leaves the sender's device.

The server may process necessary routing and delivery metadata, but must not possess the keys required to decrypt private messages.

## 10.2 Data minimization

Collect only information required for account management, message delivery, security, and service operation.

Do not collect or retain unnecessary contact lists, message contents, location information, or behavioral telemetry.

## 10.3 Local storage

- Protect local cryptographic material using platform-appropriate mechanisms.
- Minimize plaintext persistence.
- Apply appropriate browser security controls.
- Evaluate how notifications, operating-system backups, crash reports, and device compromise affect confidentiality.
- Document the limitations of web-based key storage.

## 10.4 Recovery

Account recovery and encrypted message recovery are separate concerns.

A user who recovers an account must not automatically receive the ability to decrypt another device's history unless a deliberate, secure recovery or device-linking mechanism supports it.

Any recovery secret, encrypted backup, or device-transfer mechanism must have its own threat model and recovery tests.

## 10.5 Metadata

E2EE protects message contents, but does not necessarily hide sender and recipient identifiers, IP addresses, connection times, message sizes, or delivery timestamps.

The privacy policy must describe relevant metadata collection, processing, retention, and disclosure.

# 11. Cross-Platform Requirements

## Web

- Responsive React application.
- Secure authentication and session handling.
- Encrypted local message persistence where supported.
- Keyboard accessibility.
- Browser notification support where available.
- Protection against cross-site scripting and malicious dependencies.

## Android

- React Native client using a supported cryptographic implementation.
- Secure local key storage.
- Background and push-notification handling.
- Network reconnection.
- Physical-device testing.
- Clear device registration and revocation behavior.

## iOS

- React Native client using a supported cryptographic implementation.
- Platform-appropriate secure storage.
- Push-notification integration.
- Background lifecycle and reconnection handling.
- Physical-device testing.
- Compliance with relevant App Store requirements.

## Cross-platform consistency

All clients must follow the same documented message protocol and security model.

Multi-device encrypted history synchronization will be included only when the selected protocol and implementation can support it securely. If it is deferred, that limitation must be clearly communicated to users.

# 12. Proposed Technical Constraints

The following are preferred technologies, subject to a documented architecture decision:

| Area | Preferred approach |
|---|---|
| Web | React, TypeScript, Vite |
| Mobile | React Native, Expo where compatible |
| API | Node.js, Express, TypeScript for a custom backend |
| Authentication | Firebase Auth or the selected protocol's supported account model |
| Messaging | Established protocol or a carefully designed custom service |
| Database | MongoDB for a custom backend; protocol-native storage for Matrix |
| Real-time transport | Protocol-native APIs or Socket.IO |
| Local storage | IndexedDB on web; SQLite or equivalent on mobile |
| Notifications | Firebase Cloud Messaging and Apple Push Notification service |
| Media | Object storage for encrypted attachment data in a later release |
| Testing | Unit, integration, cross-platform, security, and load tests |
| CI/CD | GitHub Actions or an equivalent pipeline |

The messaging protocol and cryptographic library must be selected before implementation of the security-critical messaging layer.

# 13. Success Metrics

Metrics must be measurable, privacy-preserving, and useful for evaluating product quality.

## Product metrics

- Successful registration rate.
- Successful first-conversation rate.
- Message send success rate.
- Message delivery success rate.
- Reconnection synchronization success rate.
- Active users and returning users during beta.
- User-reported reliability and usability.
- Blocking and reporting workflow effectiveness.

## Engineering metrics

- Message acceptance latency at p50 and p95.
- Delivery delay and synchronization lag.
- Duplicate message rate.
- Failed message rate.
- Service availability.
- Error rate and crash-free sessions.
- Backup restoration success.
- Resource consumption per active user.

## Security release gates

- No unresolved critical or high-severity security findings at broad public release.
- No known server-side plaintext exposure of private messages.
- Successful device-verification and identity-change tests.
- Successful authorization and abuse-control tests.
- Documented cryptographic dependencies and threat model.
- Completed independent review appropriate to the launch risk.

Security claims must not be based on a checklist completion percentage alone.

# 14. MVP Roadmap

## Phase 0: Architecture and feasibility

**Estimated duration:** 1–2 weeks.

Deliverables:

- Final PRD.
- Threat model.
- Matrix-versus-custom-backend evaluation.
- Cryptographic SDK and licensing evaluation.
- Web, Android, and iOS feasibility prototype.
- Architecture decision records.

Exit criteria: A documented architecture decision and successful cross-platform encryption/decryption proof of concept.

## Phase 1: Identity and device security

**Estimated duration:** 2–4 weeks after Phase 0.

Deliverables:

- Authentication.
- Profiles and usernames.
- Device registration.
- Local key management.
- Device verification.
- Session and device revocation.

Exit criteria: Users can securely establish and manage account and device identities.

## Phase 2: Private messaging

**Estimated duration:** 3–4 weeks.

Deliverables:

- Direct conversations.
- Encrypted message envelopes.
- Durable message persistence.
- Real-time delivery.
- Message acknowledgements.
- Message history and pagination.
- Offline synchronization.

Exit criteria: Two users can exchange encrypted messages and retrieve accepted messages after reconnection.

## Phase 3: Cross-platform experience

**Estimated duration:** 3–4 weeks.

Deliverables:

- Web chat interface.
- Android and iOS clients.
- Read and delivery receipts.
- Notifications.
- Connection and error states.
- Privacy settings.

Exit criteria: The supported workflows work consistently across all target platforms.

## Phase 4: Security hardening and beta

**Estimated duration:** 4–6 weeks or longer, depending on findings.

Deliverables:

- Security and authorization tests.
- Rate limiting and abuse protection.
- Blocking and reporting.
- Account deletion.
- Monitoring and backups.
- Recovery and incident-response procedures.
- Independent security review.
- Controlled beta rollout.

Exit criteria: Release gates are satisfied and no unresolved critical/high security issues remain.

**Planning estimate:** Approximately 16–24 weeks for a disciplined initial beta effort, subject to SDK compatibility, developer availability, security findings, and review time. This is not a guaranteed launch date.

# 15. MVP Acceptance Criteria

The MVP is acceptable for a controlled public beta only when all of the following conditions are met:

1. Users can register, authenticate, and manage their profiles.
2. Devices have distinct cryptographic identities.
3. Users can verify device identities and recognize identity changes.
4. Two users can exchange end-to-end encrypted private messages.
5. The server stores encrypted message payloads rather than plaintext.
6. Unauthorized users cannot access conversations or delivery events.
7. Accepted messages survive normal server restarts.
8. Offline recipients can retrieve available messages after reconnecting.
9. Retried sends do not create unintended duplicates.
10. Message status indicators reflect actual acknowledgements.
11. Push notifications do not expose message content by default.
12. Users can block accounts, report abuse, and revoke devices.
13. Account deletion follows documented retention rules.
14. Web, Android, and iOS pass the agreed functional and security test suites.
15. Monitoring, backups, restoration, and incident-response procedures have been tested.
16. Required independent security review has been completed for the intended launch scope.

# 16. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Cryptographic implementation incompatibility | Test all target platforms before committing to the architecture. |
| Incorrect custom cryptography | Use established protocols and supported implementations. |
| Unclear licensing obligations | Review library and SDK licenses before adoption. |
| Scope expansion | Maintain explicit MVP exclusions and release gates. |
| Unreliable offline delivery | Implement durable persistence, idempotency, and cursor-based synchronization. |
| Browser compromise | Strong CSP, XSS prevention, dependency controls, and clear security limitations. |
| Account takeover | Authentication hardening, device verification, revocation, and abuse controls. |
| Unexpected infrastructure costs | Measure traffic, connection counts, media use, and storage consumption. |
| Abuse and spam | Rate limits, block/report workflows, and operational moderation procedures. |
| Loss of encrypted history | Define user-controlled recovery and clearly communicate unrecoverable-loss scenarios. |
| Regulatory uncertainty | Assess applicable privacy, consumer protection, communications, and data-retention requirements before launch. |
| Solo-developer workload | Prioritize the core messaging foundation and defer advanced features. |

# 17. Dependencies and Open Decisions

The following decisions must be resolved before the implementation architecture is finalized:

1. **Messaging foundation:** Matrix-based protocol and homeserver versus a custom messaging backend.
2. **Authentication:** Firebase Auth integration versus protocol-native account management.
3. **Cryptographic implementation:** Supported libraries, platform compatibility, maintenance status, and licensing.
4. **Device model:** Primary-device-only MVP versus linked-device support from the first release.
5. **Username discovery:** Public usernames, contact discovery, and anti-enumeration controls.
6. **Recovery model:** What happens when a user loses their device or cryptographic keys.
7. **Hosting and jurisdiction:** Initial deployment region, data residency, and applicable legal obligations.
8. **Initial audience:** Invitation-only beta or open registration.
9. **Language support:** Initial languages and localization priorities.
10. **Operational ownership:** Who handles abuse reports, incidents, account support, and security updates.

No unresolved decision may silently undermine the E2EE requirement.

# 18. Project Deliverables

The project will produce:

- Approved PRD.
- Architecture decision records.
- Threat model and security design.
- Database schema and migration plan.
- API and protocol integration documentation.
- Cross-platform client applications.
- Automated tests and CI/CD pipeline.
- Deployment and operations documentation.
- Privacy policy and terms appropriate to the operating jurisdiction.
- Beta feedback and incident-management procedures.
- Post-MVP product roadmap.

# 19. Definition of Done

A feature is considered complete only when:

- Its acceptance criteria are satisfied.
- Code is reviewed and follows the documented architecture.
- Relevant tests pass.
- Security and authorization implications are reviewed.
- Error and failure states are implemented.
- Documentation is updated.
- Changes are committed with meaningful commit messages.
- The application builds successfully.
- Required manual verification is completed.
- No known critical defect remains unresolved.

For security-critical features, completion also requires review against the threat model and relevant cryptographic protocol requirements.

# 20. Final Product Direction

Communication System will begin as a cross-platform, end-to-end encrypted one-to-one messaging application.

The product will prioritize private communication, secure device identity, reliable delivery, understandable privacy controls, and operational reliability. Advanced capabilities will follow only when the underlying platform can support them without compromising its core security and reliability objectives.

The first milestone is a verified, cross-platform encrypted-message prototype. The first release milestone is a secure and usable private messaging beta. The long-term objective is to grow that foundation into a broader communication ecosystem.

**Product principle:** Build trust first, reliable communication second, and advanced features third.

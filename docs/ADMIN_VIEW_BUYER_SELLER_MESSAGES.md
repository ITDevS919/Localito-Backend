# Admin: View buyer-seller messages

Admins can view all buyer-seller conversations (read-only) from **Admin → Support Messages** by switching to the **"View buyer-seller"** tab.

## Setup

1. **Firebase service account**  
   In the Firebase Console (same project as the client chat: e.g. `greenbay-chat`), go to Project settings → Service accounts → Generate new private key.  
   You get a JSON file.

2. **Server env**  
   Set the service account JSON on the server (single line, escaped or base64 if needed):
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = full JSON string (e.g. `{"type":"service_account",...}`).

   If this is not set, the "View buyer-seller" tab will show an error and the admin conversation APIs will return 503.

## Behaviour

- **GET /admin/conversations** (admin only): returns all Firestore chat rooms with `type === "buyer-seller"`.
- **GET /admin/conversations/:roomId/messages** (admin only): returns messages for that room.
- The admin UI lists conversations and shows messages in read-only form (no send box in this view).

## Privacy / compliance

Viewing user messages is sensitive. Ensure your privacy policy and terms allow admin access for support/moderation and that only authorised admins can use this.

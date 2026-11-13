# Collect&Go session lifecycle

WickedHome's native cart/order reader uses the session imported by an owner and the same
explicit account grants as the browser integration. No password is stored. This is separate
from Xtra's `clpbff_session` connection and its in-store shopping list.

## Renewal during successful reads

After verifying the signed-in basket or the requested account's order response, the reader
accepts ordinary first-party session cookies from separate `Set-Cookie` response headers.
Subsequent requests, including pagination and reservations in the same activity snapshot,
use the updated cookies. The service saves them in the existing encrypted household file,
under the household lock, for reuse by all selected accounts and after an application restart.
Expiry, `Max-Age`, deletion, domain and path restrictions are preserved. Owner changes and
revocations fence pending reads so an old request cannot restore a revoked connection.

The reader discards tracking cookies, AntiBot-token changes, other account IDs, invalid
cookie scopes, and cookies returned with failed, guest or unverified responses. It does not
send extra background requests merely to keep an account signed in. Provider expiry rules
still apply while nobody uses the connection.

The underlying HCL Commerce documentation describes session cookie updates during normal
requests: [REST authentication flow](https://help.hcl-software.com/commerce/7.0.0/com.ibm.commerce.webservices.doc/concepts/cwvrestauthflow.html)
and [session timeout](https://www.help.hcl-software.com/commerce/9.0.0/admin/concepts/cseenabtimeout.html).
These describe the platform, not a guarantee that Collect&Go issues a renewal on every read.

## Full login expiry and AntiBot

Saving updated cookies is not an OAuth refresh grant or automatic sign-in after credentials
have fully expired. The available cart-request capture has no login or refresh exchange.
The [reference Xtra client](https://github.com/ddvlamin/xtra-mcp/blob/main/xtra/sdk/colruyt.py)
also supplies static browser credentials; it does not implement Collect&Go authentication
or automatic sign-in. Do not infer a Collect&Go refresh endpoint from generic HCL APIs.

The observed API failure was HTML titled `Colruyt | AntiBot` with HTTP 405. A public website
read during investigation also returned that title with HTTP 456. This is distinct from a
401/403 login rejection. Ordinary Chrome working does not establish server API access.
The integration stops on a challenge. An explicit **Test connection** can try the saved
session again; it cannot guarantee access or solve the challenge. Cookie renewal has been
verified with synthetic server responses; live renewal remains unverified while blocked.

To implement automatic reauthentication, first establish the actual Collect&Go sign-in/session
renewal protocol from documented provider support or an authorized capture of the normal
browser's renewal traffic. Keep any such capture private and outside version control. The
existing cart capture must never be replayed: its observed POST adds a product to the cart.

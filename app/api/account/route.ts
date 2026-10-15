import { accountDatabase } from '../../../lib/account-db.ts';
import { accountAction, accountFailure, currentAccount } from '../../../lib/accounts.ts';
export async function GET(request: Request) {
  try {
    return Response.json(
      { account: await currentAccount(request) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return accountFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const result = await accountAction(request, await accountDatabase());
    const headers = new Headers({ 'Cache-Control': 'private, no-store' });
    if (result.cookie) {
      headers.append('Set-Cookie', result.cookie);
      for (const name of ['fg_youtube_session', 'fg_youtube_state'])
        headers.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    }
    return Response.json({ account: result.account }, { headers });
  } catch (error) {
    return accountFailure(error);
  }
}

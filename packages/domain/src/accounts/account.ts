import { type ProviderId, Providers } from '#domain/providers/provider';
import { assertDomain, DomainErrorCode } from '#domain/shared/domain-error';

export const PersonalAccount = 'personal';

const AccountNamePattern = /^[a-z][a-z0-9-]{0,31}$/;
const ReservedAccountNames = [PersonalAccount, 'default'];

export function isPersonalAccount(name: string) {
  return name === PersonalAccount;
}

export function assertAccountName(name: string) {
  assertDomain(
    AccountNamePattern.test(name),
    DomainErrorCode.invalidAccountName,
    'An account name starts with a letter and uses lowercase letters, numbers and dashes, up to 32 characters.'
  );
  assertDomain(
    !ReservedAccountNames.includes(name),
    DomainErrorCode.invalidAccountName,
    `"${name}" is reserved: it is your own ~/.claude, ~/.codex and so on.`
  );
}

export function seatHomeOf(paths: { home: string; accounts: string }, account: string, provider: ProviderId) {
  if (isPersonalAccount(account)) return `${paths.home}/${Providers[provider].personalHome}`;
  return `${paths.accounts}/${account}/${provider}`;
}

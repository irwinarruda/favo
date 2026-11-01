export const HelpText = `favo, a honeycomb for your AI subscriptions

  favo                               open the comb
  favo claude [account] [-- args]    run a provider as an account
                                     (claude, codex, agy, opencode)
                                     --dir <folder> starts it in that folder

Accounts
  favo list [--json]                 every machine, account and login
  favo add <account>                 add a cell
  favo rename <account> <new name>   rename a cell, its folder stays put
  favo rm <account>                  move a cell to the trash
  favo login <account> <provider>    sign in, with the official command
  favo logout <account> <provider>   sign out
  favo path <account> <provider>     print the config path, for T3 Code
  favo sync [account]                repair shared links
  favo inspect <account> <provider>  show what is shared and what is private
  favo adopt <account> <provider> <folder>
                                     move an existing config folder in

Machines
  favo machine list                  machines this one can reach
  favo machine discover              find machines on ssh and Tailscale
  favo machine add <user@host>       add a machine and install favo there
  favo machine install <machine>     update favo on a machine
  favo machine update                update every machine on an older favo
  favo machine rm <machine>          forget a machine

Themes
  favo theme                         list themes
  favo theme <theme>                 use a theme, saved in ~/.favo/config.json
                                     custom themes live in ~/.favo/themes

Most commands take --machine <machine> to run on another computer.
`;

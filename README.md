# Truc mallorquí

## Firebase room lifecycle

Rooms are listed under `roomDirectory` and their game state is stored under
`rooms`. Connected clients watch room presence and remove a room after no
participants have been present for 10 seconds. The delay allows a player with
a brief connection drop to rejoin. This client-side cleanup requires at least
one app client to remain connected; if every client goes offline, an abandoned
room is removed when someone next opens the app and observes it empty.

Deploy the database rules with the Firebase CLI:

```powershell
firebase.cmd deploy --only database
```

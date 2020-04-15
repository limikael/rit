Rcrepo
------

Repo like frontend for rclone.

Howto:

1. First set up rclone remotes. For help, see e.g.:
  https://rclone.org/drive/

2. Init a local repo, run:
  rcrepo init

3. Init remote revisions, run:
  rcrepo initremote remote:path
  rcrepo initremote remote:path --dry-run

4. Check status
  rcrepo status
  rcrepo status --local

5. Sync!
  rcrepo sync
  rcrepo sync --dry-run
$DeployUser = "your-ssh-user"
$DeployHost = "example.com"
$DeployPath = "/var/www/wordwefter"

# Optional: set if you use a non-default SSH key.
# $DeployIdentityFile = "$env:USERPROFILE\.ssh\id_ed25519"

# Keep server-side saved games intact by default.
$DeployExclude = @(
  "saved-games"
)

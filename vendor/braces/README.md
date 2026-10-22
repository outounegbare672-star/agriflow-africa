# Local braces security patch

This local fork is based on `braces` 3.0.3 and retains its MIT license.
It limits nested brace and parenthesis parser blocks to 100 levels to prevent
stack exhaustion in the recursive compile and expansion walkers.

The upstream package has no published patched release yet. Remove this fork
and its npm override once an upstream release includes an equivalent depth
guard.

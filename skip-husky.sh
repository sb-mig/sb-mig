#!/bin/bash

# Force skip
[[ ! -z $NO_HUSKY ]] && exit 0

# Do not check if pushing to alternative origin (already checked)
[[ $HUSKY_GIT_PARAMS =~ 'altorigin' ]] && exit 0

# Avoid husky when push :branch or --delete
[[ $HUSKY_GIT_STDIN =~ 'delete' ]] && exit 0

exit 1
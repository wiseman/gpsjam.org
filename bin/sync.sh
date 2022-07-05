#!/bin/bash
set -e

base_dir="$(dirname "$0")"
public_dir=$base_dir/../
chmod a-x "${public_dir}"/data/*.csv
chmod a+r "${public_dir}"/data/*.csv
remote="heavymeta.org:/var/www/lab.heavymeta.org/html/gpsjam"
rsync -av --info=progress2 --checksum --exclude='.git/' "$public_dir" "$remote"

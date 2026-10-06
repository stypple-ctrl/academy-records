#!/usr/bin/env bash
# index.html#test 를 headless Chrome으로 열어 selfTest() 결과를 확인한다.
cd "$(dirname "$0")/.."
out=$("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom "file://$PWD/index.html#test" 2>/dev/null | grep -o 'id="selftest">SELFTEST [^<]*' | sed 's/.*">//')
echo "${out:-SELFTEST NO RESULT}"
[[ $out == "SELFTEST PASS"* ]]

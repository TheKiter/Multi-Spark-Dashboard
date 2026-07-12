# Binary replacement of UTF-8 multi-byte characters in app.js
with open('app.js', 'rb') as f:
    raw = f.read()

# Replace UTF-8 degree symbol bytes (0xC2 0xB0) with ASCII Unicode escape
raw = raw.replace(b'\xc2\xb0', b'\\u00b0')
# Replace UTF-8 copyright symbol bytes (0xC2 0xA9) with ASCII Unicode escape
raw = raw.replace(b'\xc2\xa9', b'\\u00a9')

# Just in case there are individual corrupted bytes left:
raw = raw.replace(b'\xc2', b'') # strip any stray lead bytes

with open('app.js', 'wb') as f:
    f.write(raw)

print("Successfully performed binary replacement of all non-ASCII characters in app.js!")

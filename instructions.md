## Templates

Templates are JavaScript template literals allowing embedded expressions with access to a lot of useful variables and utilities. Example:

```
${filename}_suffix.${ext}
```

If template is a relative path (doesn't start with `/` or a drive letter), it'll be resolved from the file's current directory. This means you don't have to prepend it in every template, and can use `../` to move files up in directory tree, `foo/...` to move them into a new one, and combination of both.

If template moves file into a directory that doesn't exist, it'll be created.

You can split long templates with new lines, they'll be removed before template is expanded.

### Current file variables

`path` - full file/folder path → `/foo/bar/baz.jpg`
`basename` - file basename → `baz.jpg`
`filename` - file name without the extension → `baz`
`extname` - file extension with the dot → `.jpg`
`ext` - file extension without the dot → `jpg`
`dirname` - directory path → `/foo/bar`
`dirbasename` - name of a parent directory → `bar`
`size` - file size in bytes, 0 for folders
`atime` - last access time in unix epoch milliseconds
`mtime` - last modification time in unix epoch milliseconds
`ctime` - last status change time (permission, rename, ...) in unix epoch milliseconds
`birthtime` - file creation time in unix epoch milliseconds
`isfile` - boolean if item is a file
`isdirectory` - boolean if item is a directory
`crc32/md5/sha1/sha256/sha512` - lowercase file checksums
`CRC32/MD5/SHA1/SHA256/SHA512` - uppercase file checksums
`i` - 0 based index in current batch
`I` - 0 based index automatically padded for the current batch \*
`n` - 1 based index in current batch
`N` - 1 based index automatically padded for the current batch \*

_\* These number are automatically padded with zeroes when necessary. If batch is between 1-9 files, there's no padding, if batch is between 10-99 files, 0-9 numbers are padded with 1 zero, etc..._

### Common variables for all files

`commondir` - common directory of all dropped files in current batch
`starttime` - time when renaming started in unix epoch milliseconds

Platform folder paths: `tmp`, `home`, `downloads`, `documents`, `pictures`, `music`, `videos`, `desktop`

`files[]` - an array of files in current batch, each item being an object with these properties:

```
STRINGS: path, basename, filename, extname, ext, dirname, dirbasename
NUMBERS: size, atime, mtime, ctime, birthtime
BOOLEANS: isFile, isDirectory
```

Access with `files[0].basename`.

### Utilities

`Path` - Reference to <a href="https://nodejs.org/api/path.html">Node.js' `path` module</a>. Example: `Path.relative(foo, bar)`
`time()` - <a href="https://day.js.org/docs/en/display/format">day.js</a> constructor to help with time. Example: `time().format('YY')`
`uid(size? = 10)` - Unique string generator. Size argument is optional, default is 10. This is a way faster alternative to generating file checksums.

### Examples

Serialize all dropped files with automatically padded index number:

```
${N}${extname}
```

---

Replace all `foo` occurences in a filename with `bar`:

```
${filename.replaceAll('foo', 'bar')}${extname}
```

Replace all `foo` or `bar` occurences in a filename with `baz`:

```
${filename.replace(/foo|bar/gi, 'baz')}${extname}
```

---

Use audio file meta to name the file:

```
${meta.artist} - ${meta.album} - ${meta.title}${extname}
```

Use media file meta title to name the file, with a fallback to previous filename:

```
${meta.title || filename}${extname}
```

Requires **On missing meta** option to be set to **Ignore**, otherwise missing meta means error, and renaming will abort.

_Uses `ffprobe` to retrive the meta, which considerably slows down renaming._

---

Prepend time when renaming started to each filename:

```
${time(starttime).format('YYYY-MM-DD-HH.mm.ss')}-${basename}
```

Prepend file's creation time to each filename:

```
${time(birthtime).format('YYYY-MM-DD-HH.mm.ss')}-${basename}
```

Serialize and prepend current seconds since unix epoch:

```
${time(starttime).unix()} ${N}${basename}
```

---

Append CRC32 checksum to each filename:

```
${filename} [${CRC32}]${extname}
```

Same, but ensure the previous one is deleted (useful for re-encoded videos):

```
${filename.replace(/[\s\.\-_]*\[\w+\]\s*$/i, '')} [${CRC32}]${extname}
```

_Note that generating file checksums will slow down renaming jobs, especially for big files._

---

Move files up one level in a directory tree, and prepend their original parent directory name to their filename:

```
../${dirbasename}-${basename}
```

---

Flatten files by placing them all into a common directory of all dropped files, and prepending their parent directory names relative from the common directory into their filename:

```
${commondir}/
${Path.relative(commondir, dirname).replaceAll(Path.sep, '-')}
-${basename}
```

_(Big tempaltes can be split into multiple lines to help with making sense of them. The new lines will be removed in the final filename.)_

Useful if you want to just throw a single directory into a profile with directory expansion enabled, and have it flatten all of the files inside it.

If you drop in directory `/foo` with this structure:

```
/foo/
  ├ file1.jpg
  ├ bar/
  │ ├ file1.jpg
  │ └ file2.jpg
  └ baz/
    ├ file1.jpg
    ├ file2.jpg
    └ bam/
      ├ file1.jpg
      └ file2.jpg
```

You'll get:

```
/foo/
  ├ bar-file1.jpg
  ├ bar-file2.jpg
  ├ baz-bam-file1.jpg
  ├ baz-bam-file2.jpg
  ├ baz-file1.jpg
  ├ baz-file2.jpg
  └ file1.jpg
```

---

Move file into your platform's pictures directory, ensuring no conflicts by prepending it's original directory location to the moved file name:

```
${pictures}/${path.replace(/[\\\/\:]+/g, '-')}
```

---

Serialize all dropped files, using the filename of the 1st one as the base name for all:

```
${files[0].filename} ${N}${extname}
```

If you drop these files in:

```
bar.jpg
baz.jpg
foo.jpg
```

They'll be renamed to:

```
bar 1.jpg
bar 2.jpg
bar 3.jpg
```
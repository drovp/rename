# @drovp/rename

Bulk rename files according to a configured template.

Features:

-   Templates with powerful JS expression support.
-   Extensive variables and utilities available in template expressions.
-   Supports moving files up/down the directory tree, or between partitions/drives.
-   Computes crc32, md5, sha1, sha256, sha512 file checksums when template asks for it.
-   Extracts meta data (artist, title, ...) from media files when template asks for it.
-   Variables for paths to common platform folders such as home, downloads, documents, pictures, music, videos,...
-   Checks for file name conflicts before renaming.
-   If any error occurs during renaming, will attempt to revert all changes that happened before the error occured.

## Template

Templates are JavaScript template literals allowing embedded expressions. They have access to a lot of variables to help you rename dropped files.

Example template:

```
string ${expression}${extname}
```

### Variables

_**All variables and utilities available in expressions are listed in template option's description.**_

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

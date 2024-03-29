# @drovp/rename

[Drovp](https://drovp.app) plugin for bulk renaming files according to a configured template.

<br>
<p align="center">
  <img src="https://user-images.githubusercontent.com/47283320/183929031-74e6493c-f665-4c8d-9bd6-baf7b8bba815.png" />
</p>

### Features:

-   Powerful templating using JavaScript template literals.
-   Extensive variables and utilities available in template expressions.
-   Supports moving files up/down the directory tree, or between partitions/drives.
-   Computes crc32, md5, sha1, sha256, sha512 file checksums when template asks for it.
-   Extracts meta data (artist, title, ...) from media files when template asks for it.
-   Variables for paths to common platform folders such as home, downloads, documents, pictures, music, videos,...
-   Checks for file name conflicts before renaming.
-   If any error occurs during renaming, will attempt to revert all changes that happened before the error.

## Templates

Templates are JavaScript template literals allowing embedded expressions.

_All variables and utilities available in templates are documented in profile's instructions._

### Examples

Serialize all dropped files with automatically padded 1 based index:

```
${N}${extname}
```

Offset the 1 based index by 10 and pad it to length of `4` with `pad()` util:

```
${pad(n + 10, 4)}${extname}
```

... which is just a shorthand for:

```
${String(n + 10).padStart(4, '0')}${extname}
```

Offset and determine pad length based on max index:

```
${pad(n + 10, String(files.length).length)}${extname}
```

Pad `n` to `4` letters while using underscore to fill gaps:

```
${pad(n, 4, '_')}${extname}
```

---

Replace all `foo` occurrences in a filename with `bar`:

```
${filename.replaceAll('foo', 'bar')}${extname}
```

Replace all `foo` or `bar` occurrences in a filename with `baz`:

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

Prepend operation start time to each filename:

```
${Time(starttime).format('YYYY-MM-DD-HH.mm.ss')}-${basename}
```

Prepend file's creation time to each filename:

```
${Time(birthtime).format('YYYY-MM-DD-HH.mm.ss')}-${basename}
```

Serialize and prepend current seconds since unix epoch:

```
${Time(starttime).unix()} ${N}${basename}
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
${Path.relative(commondir, dirname).replace(/[\\\/\:]+/g, '-')}
-${basename}
```

_(Big templates can be split into multiple lines to help with making sense of them. New lines will be removed in the final filename.)_

Useful if you want to just throw a single directory into a profile with directory expansion enabled, and have it flatten all of the files inside.

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

Move file into your platform's pictures folder, ensuring no conflicts by prepending it's original location to the file name:

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

import path from 'path';

/**
 * Path security validator.
 *
 * Prevents path traversal attacks by ensuring all paths
 * remain within the allowed directory.
 */
export class PathValidator {
  /**
   * Validate that a file path is within the allowed directory.
   *
   * @param filePath - Path to validate
   * @param allowedDir - Directory that must contain the path
   * @throws Error if path is outside the allowed directory
   *
   * @example
   * PathValidator.validate('/uploads/task1/file.pdf', '/uploads')  // OK
   * PathValidator.validate('/uploads/../etc/passwd', '/uploads')   // Throws
   */
  static validate(filePath: string, allowedDir: string): void {
    const resolvedPath = path.resolve(filePath);
    const resolvedAllowedDir = path.resolve(allowedDir);

    // Allow the path to be exactly the allowed directory or within it
    const isWithinDir =
      resolvedPath === resolvedAllowedDir ||
      resolvedPath.startsWith(resolvedAllowedDir + path.sep);

    if (!isWithinDir) {
      throw new Error(
        `Security error: Path "${filePath}" is outside allowed directory. ` +
          `Possible path traversal attack detected.`
      );
    }
  }

  /**
   * Safely join path segments and validate the result.
   *
   * Sanitizes segments by repeatedly removing path traversal patterns
   * (e.g., "..", leading/trailing slashes) until stable.
   *
   * @param baseDir - Base directory
   * @param segments - Path segments to join
   * @returns Validated full path
   * @throws Error if resulting path is outside base directory
   *
   * @example
   * PathValidator.safePath('/uploads', 'task1', 'file.pdf')
   * // Returns '/uploads/task1/file.pdf'
   *
   * PathValidator.safePath('/uploads', '../etc', 'passwd')
   * // Throws security error
   */
  static safePath(baseDir: string, ...segments: string[]): string {
    // Sanitize each segment by repeatedly removing dangerous patterns
    const sanitizedSegments = segments.map((seg) => {
      let prev = '';
      let current = seg;

      // Keep sanitizing until no changes occur
      while (prev !== current) {
        prev = current;
        current = current
          .replace(/\.\./g, '') // Remove ..
          .replace(/^[/\\]+/, '') // Remove leading slashes
          .replace(/[/\\]+$/, ''); // Remove trailing slashes
      }

      return current;
    });

    const fullPath = path.join(baseDir, ...sanitizedSegments);
    this.validate(fullPath, baseDir);

    return fullPath;
  }
}

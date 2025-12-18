/**
 * String manipulation utilities
 */

/**
 * Extracts the filename from a file URL or path.
 * Returns the last segment after splitting by "/".
 *
 * @param fileUrl - The URL or path string to extract filename from
 * @returns The extracted filename
 * @throws Error if filename cannot be extracted (empty string or no segments)
 *
 * @example
 * getFileName("https://example.com/assets/image.png") // => "image.png"
 * getFileName("/path/to/file.txt") // => "file.txt"
 * getFileName("simple.js") // => "simple.js"
 */
export const getFileName = (fileUrl: string): string => {
    const fileName = fileUrl.split("/").pop();
    if (fileName) {
        return fileName;
    } else {
        throw Error("File name couldn't be extracted from URL.");
    }
};

/**
 * Extracts the size segment from a Storyblok asset URL.
 * Storyblok asset URLs have the format: .../size/hash/filename
 * This function extracts the size segment (3 positions before the end).
 *
 * @param fileUrl - The Storyblok asset URL
 * @returns The size segment from the URL
 *
 * @example
 * getSizeFromURL("https://a.storyblok.com/f/12345/1920x1080/abc123/image.png")
 * // => "1920x1080"
 *
 * getSizeFromURL("https://a.storyblok.com/f/12345/100x100/xyz789/thumb.jpg")
 * // => "100x100"
 */
export const getSizeFromURL = (fileUrl: string): string => {
    const data = fileUrl.split("/");
    const sizePos = data.length - 3;
    return data[sizePos] as string;
};

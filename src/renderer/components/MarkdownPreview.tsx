import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypePrism from "rehype-prism-plus";
import "katex/dist/katex.min.css";
import "prismjs/themes/prism.css";
import "../styles/markdown.css";

interface MarkdownPreviewProps {
  content: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  return (
    <div
      className="markdown-preview"
      style={{
        padding: "24px",
        height: "100%",
        width: "100%",
        minWidth: 0,
        overflow: "auto",
        backgroundColor: "#fffbe6",
        boxSizing: "border-box",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex, [rehypePrism, { ignoreMissing: true }]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownPreview;

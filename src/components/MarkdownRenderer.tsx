import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const isInline = inline || !match;

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isInline) {
    return (
      <code 
        className="bg-[#F0F2F5] dark:bg-[#1A1D24] text-[#D93838] dark:text-[#FCA5A5] px-1.5 py-0.5 rounded-md text-[13px] font-mono mx-0.5 border border-[#EAE7DC] dark:border-white/[0.04]"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[#EAE7DC] dark:border-white/[0.08] bg-[#FAF9F5] dark:bg-[#0B0D10] shadow-sm group">
      <div className="flex items-center justify-between px-4 py-2 bg-[#F0F2F5] dark:bg-[#14171C] border-b border-[#EAE7DC] dark:border-white/[0.08]">
        <span className="text-[11px] font-mono text-[#596E8A] dark:text-[#9299A6] lowercase">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[#596E8A] dark:text-[#9299A6] hover:text-[#1677FF] dark:hover:text-[#40BFFF] transition-colors"
        >
          {copied ? (
            <>
              <Check size={12} className="text-[#10B981]" />
              <span className="text-[#10B981]">Kopyalandı</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Kopyala</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-4">
        <code className="text-[13px] font-mono text-[#071A3D] dark:text-[#F4F4F5] whitespace-pre" {...props}>
          {children}
        </code>
      </div>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-[18px] font-bold text-[#071A3D] dark:text-white mt-5 mb-3 leading-snug" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-[16px] font-semibold text-[#071A3D] dark:text-[#F4F4F5] mt-4 mb-2.5 leading-snug" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-[14.5px] font-medium text-[#071A3D] dark:text-[#F4F4F5] mt-3 mb-2 leading-snug" {...props} />,
          p: ({ node, ...props }) => <p className="text-[15px] text-[#071A3D] dark:text-[#F4F4F5] leading-[1.65] mb-3 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1.5 text-[#071A3D] dark:text-[#F4F4F5] marker:text-[#1677FF] dark:marker:text-[#40BFFF]" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-[#071A3D] dark:text-[#F4F4F5] marker:font-medium marker:text-[#596E8A] dark:marker:text-[#9299A6]" {...props} />,
          li: ({ node, ...props }) => <li className="text-[15px] leading-relaxed pl-1" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-[#071A3D] dark:text-white" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-[#071A3D] dark:text-[#F4F4F5]" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-[#1677FF] dark:border-[#40BFFF] pl-4 py-1 my-4 bg-[#F0F2F5]/50 dark:bg-[#14171C]/50 rounded-r-lg italic text-[#596E8A] dark:text-[#9299A6]" {...props} />
          ),
          hr: ({ node, ...props }) => <hr className="my-6 border-0 h-[1px] bg-[#EAE7DC] dark:bg-white/[0.08]" {...props} />,
          a: ({ node, ...props }) => (
            <a 
              className="text-[#1677FF] dark:text-[#40BFFF] hover:underline decoration-[#1677FF]/30 dark:decoration-[#40BFFF]/30 underline-offset-2" 
              target="_blank" 
              rel="noopener noreferrer" 
              {...props} 
            />
          ),
          table: ({ node, ...props }) => (
            <div className="w-full overflow-x-auto my-4 rounded-lg border border-[#EAE7DC] dark:border-white/[0.08]">
              <table className="w-full text-left border-collapse text-[14px]" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-[#FAF9F5] dark:bg-[#14171C] border-b border-[#EAE7DC] dark:border-white/[0.08]" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-[#EAE7DC] dark:divide-white/[0.08]" {...props} />,
          tr: ({ node, ...props }) => <tr className="hover:bg-[#F0F2F5]/50 dark:hover:bg-[#1A1D24]/50 transition-colors" {...props} />,
          th: ({ node, ...props }) => <th className="px-4 py-2.5 font-medium text-[#596E8A] dark:text-[#9299A6]" {...props} />,
          td: ({ node, ...props }) => <td className="px-4 py-2.5 text-[#071A3D] dark:text-[#F4F4F5]" {...props} />,
          code: CodeBlock as any,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

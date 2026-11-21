import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'汉法新闻编译数智教学平台',description:'Plateforme pédagogique de traduction journalistique chinois-français · 私有测试版',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}

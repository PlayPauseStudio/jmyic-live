import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-8">Judge Me If You Can</h1>
        <p className="text-xl text-gray-300 mb-12">The Ultimate Comedy Game Show</p>
        
        <div className="space-y-4">
          <div>
            <Link
              href="/operator"
              className="inline-block px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-lg hover:bg-blue-500 transition-colors"
            >
              🎛️ Operator Panel
            </Link>
          </div>
          
          <div>
            <Link
              href="/audience"
              className="inline-block px-8 py-4 bg-green-600 text-white text-xl font-semibold rounded-lg hover:bg-green-500 transition-colors"
            >
              👥 Audience Display
            </Link>
          </div>

          <div>
            <Link
              href="/play"
              className="inline-block px-8 py-4 bg-purple-600 text-white text-xl font-semibold rounded-lg hover:bg-purple-500 transition-colors"
            >
              📱 Play Along
            </Link>
          </div>
        </div>
        
        <div className="mt-12 text-gray-400">
          <p>Built with Next.js 14 + TypeScript + Firebase</p>
        </div>
      </div>
    </div>
  );
}
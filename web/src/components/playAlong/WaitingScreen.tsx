interface WaitingScreenProps {
  message: string;
  subMessage?: string;
}

export default function WaitingScreen({ message, subMessage }: WaitingScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-purple-400/40 border-t-purple-400 rounded-full animate-spin mx-auto mb-6" />
        <p className="text-white text-xl font-semibold">{message}</p>
        {subMessage && <p className="text-purple-300 text-sm mt-2">{subMessage}</p>}
      </div>
    </div>
  );
}

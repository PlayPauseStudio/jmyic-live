import React, { useState, useRef } from 'react';
import { db, questionsDocRef } from '@/lib/firebase';
import { setDoc } from 'firebase/firestore';
import Papa from 'papaparse';
import { gameStateManager } from '@/lib/gameState';
import type { GameState } from '@/lib/types';



interface CSVUploadProps {
  onSuccess: () => void;
  onError: (error: string) => void;
  gameState?: GameState | null;
}

export default function CSVUpload({ onSuccess, onError, gameState }: CSVUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);


  const handleFileSelect = (file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError('Please select a CSV file');
      return;
    }

    uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);

    try {
      // Parse CSV file
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            console.log('Parsed CSV data:', results.data);

            // Process and clean the questions data
            const questions = results.data.map((row: any, index: number) => {
              const questionData = {
                id: `q_${Date.now()}_${index}`,
                question: row.question || '',
                option_a: row.option_a || '',
                option_b: row.option_b || '',
                option_c: row.option_c || '',
                option_d: row.option_d || '',
                guest_answer: row.guest_answer || '',
                createdAt: new Date().toISOString(),
                rowIndex: index
              };

              console.log(`Processed question ${index + 1}:`, questionData);
              return questionData;
            });

            // Save all questions to a single Firebase document
            await setDoc(questionsDocRef, {
              questions: questions,
              lastUpdated: new Date().toISOString(),
              totalQuestions: questions.length
            });

            console.log(`Successfully uploaded ${questions.length} questions to Firebase`);

            onSuccess();

            // Clear file input
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          } catch (error) {
            console.error('Firebase upload error:', error);
            onError('Failed to save questions to database');
          }
        },
        error: (error) => {
          console.error('CSV parse error:', error);
          onError('Failed to parse CSV file');
        }
      });
    } catch (error) {
      console.error('CSV upload error:', error);
      onError(error instanceof Error ? error.message : 'Failed to upload CSV');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.name.toLowerCase().endsWith('.csv'));

    if (csvFile) {
      handleFileSelect(csvFile);
    } else {
      onError('Please drop a CSV file');
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const downloadTemplate = () => {
    const csvContent = `question,option_a,option_b,option_c,option_d,guest_answer
"What is your favorite color?","Red","Blue","Green","Yellow","A"
"What is your hobby?","Reading","Gaming","Sports","Music","B"
"Where do you live?","City","Suburbs","Village","Mountains","C"`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  const handleTriggerBuzzer = () => {
    gameStateManager.updateGameStateBackground({ buzzerTrigger: Date.now() });
  };

  const handleToggle75_25Banner = () => {
    gameStateManager.updateGameStateBackground({ show75_25Banner: !gameState?.show75_25Banner });
  };

  const handleToggleSoftElimination = () => {
    gameStateManager.updateGameStateBackground({ softEliminated: !gameState?.softEliminated });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-4">CSV Upload</h2>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${dragOver
          ? 'border-blue-500 bg-blue-500 bg-opacity-10'
          : uploading
            ? 'border-yellow-500 bg-yellow-500 bg-opacity-10'
            : 'border-gray-600 hover:border-gray-500'
          }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {uploading ? (
          <div className="text-yellow-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto mb-3"></div>
            <p className="text-sm font-semibold">Uploading...</p>
            <p className="text-xs text-gray-400">Processing questions</p>
          </div>
        ) : (
          <div className="text-gray-300">
            <div className="text-2xl mb-2">📁</div>
            <p className="text-sm font-semibold mb-1">Drop CSV here</p>
            <p className="text-xs text-gray-400 mb-3">or click to browse</p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
              id="csv-upload"
              disabled={uploading}
            />

            <label
              htmlFor="csv-upload"
              className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-500 transition-colors"
            >
              Choose File
            </label>
          </div>
        )}
      </div>

      {/* Template Download */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-white">CSV Format</h3>
          <button
            onClick={downloadTemplate}
            disabled={uploading}
            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            📥 Template
          </button>
        </div>

        <div className="bg-gray-700 rounded p-2 text-xs">
          <p className="text-gray-300 mb-1">Required columns:</p>
          <code className="text-green-400 text-xs block break-all">
            question,option_a,option_b,option_c,option_d,guest_answer
          </code>
          <p className="text-gray-400 text-xs mt-1">
            Answer: A, B, C, or D
          </p>
        </div>
      </div>

      {/* Upload Stats */}
      <div className="mt-3 p-2 bg-gray-700 rounded">
        <div className="text-xs text-gray-300 space-y-1">
          <p>✅ Drag & drop support</p>
          <p>✅ Real-time refresh</p>
          <p>✅ Auto validation</p>
        </div>
      </div>

      {/* 75:25 Banner Control */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">🎯 75:25 Banner</h3>
        <div className="bg-gray-700 border border-purple-500 rounded-lg p-4">
          <div className="text-purple-300 text-sm mb-3">
            Toggle the 75:25 banner on the audience display. Banner will slide up from bottom when shown.
          </div>
          <button
            onClick={handleToggle75_25Banner}
            className={`px-6 py-3 rounded font-semibold transition-colors text-lg ${gameState?.show75_25Banner
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
          >
            {gameState?.show75_25Banner ? '❌ Hide 75:25' : '✨ Show 75:25'}
          </button>
        </div>
      </div>

      {/* Soft Elimination Control */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">💀 Soft Elimination</h3>
        <div className="bg-gray-700 border border-red-500 rounded-lg p-4">
          <div className="text-red-300 text-sm mb-3">
            Manually toggle soft elimination. When on, the audience banner shows and the
            All&nbsp;or&nbsp;Nothing / game-over controls unlock.
          </div>
          <button
            onClick={handleToggleSoftElimination}
            className={`px-6 py-3 rounded font-semibold transition-colors text-lg ${gameState?.softEliminated
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
          >
            {gameState?.softEliminated ? '✅ Undo Soft Elimination' : '💀 Soft Eliminate Guest'}
          </button>
        </div>
      </div>

      {/* Buzzer Control - Always Show */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">🔔 Host Alert</h3>
        <div className="bg-gray-700 border border-yellow-500 rounded-lg p-4">
          <div className="text-yellow-300 text-sm mb-3">
            Use this buzzer to alert the live host if they are explaining a wrong rule or are confused about the game.
            Sound will play on audience display only.
          </div>
          <button
            onClick={handleTriggerBuzzer}
            className="px-6 py-3 bg-yellow-600 text-white rounded font-semibold hover:bg-yellow-500 transition-colors text-lg"
          >
            🔔 TRIGGER BUZZER
          </button>
        </div>
      </div>
    </div>
  );
}
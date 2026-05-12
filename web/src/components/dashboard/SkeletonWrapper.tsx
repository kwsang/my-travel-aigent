import React from 'react';

interface SkeletonWrapperProps {
  isLoading?: boolean;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

export default function SkeletonWrapper({ isLoading, fallback, children }: SkeletonWrapperProps) {
  return isLoading ? <>{fallback}</> : <>{children}</>;
}